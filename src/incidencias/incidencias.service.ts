import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, SeveridadIncidencia } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface IncidenciaFiltros {
  severidad?: SeveridadIncidencia;
  modulo?: string;
  resuelto?: boolean;
  busqueda?: string;
  desde?: string;
  hasta?: string;
}

export interface IncidenciaPaginacion {
  page?: number;
  pageSize?: number;
}

const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 1000; // mismo tope que el `take` fijo que reemplaza

export interface RegistrarIncidenciaData {
  usuarioId?: string;
  usuarioNombre?: string;
  modulo: string;
  opcion: string;
  codigoError: number;
  mensaje: string;
  stackTrace?: string;
  severidad: SeveridadIncidencia;
  contexto?: object;
}

// Retención acordada para Fase 1: solo se purgan incidencias ya marcadas
// como resueltas y con más de 90 días — las no resueltas se conservan
// indefinidamente hasta que alguien las atienda.
const DIAS_RETENCION_RESUELTAS = 90;

@Injectable()
export class IncidenciasService {
  private readonly logger = new Logger('IncidenciasService');

  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, filtros: IncidenciaFiltros = {}, paginacion: IncidenciaPaginacion = {}) {
    const { severidad, modulo, resuelto, busqueda, desde, hasta } = filtros;
    const page = Math.max(1, paginacion.page ?? 1);
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, paginacion.pageSize ?? PAGE_SIZE_DEFAULT));

    const where: Prisma.RegistroIncidenciaWhereInput = {
      empresaId,
      ...(severidad !== undefined && { severidad }),
      ...(modulo && { modulo }),
      ...(resuelto !== undefined && { resuelto }),
      ...(busqueda && { mensaje: { contains: busqueda, mode: 'insensitive' } }),
      ...(desde || hasta
        ? {
            timestamp: {
              ...(desde && { gte: new Date(desde) }),
              ...(hasta && { lte: new Date(`${hasta}T23:59:59.999Z`) }),
            },
          }
        : {}),
    };

    return this.prisma.withTenant(empresaId, async (tx) => {
      const [data, total, criticosCount, pendientesCount, resueltosCount] = await Promise.all([
        tx.registroIncidencia.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.registroIncidencia.count({ where }),
        tx.registroIncidencia.count({
          where: { AND: [where, { severidad: SeveridadIncidencia.CRITICO, resuelto: false }] },
        }),
        tx.registroIncidencia.count({ where: { AND: [where, { resuelto: false }] } }),
        tx.registroIncidencia.count({ where: { AND: [where, { resuelto: true }] } }),
      ]);

      return {
        data,
        total,
        page,
        pageSize,
        kpis: {
          total,
          criticos: criticosCount,
          pendientes: pendientesCount,
          resueltos: resueltosCount,
        },
      };
    });
  }

  /**
   * Registra una incidencia — llamado desde HttpExceptionFilter. Best-effort:
   * el llamador debe atrapar cualquier error, nunca debe romper la respuesta
   * ya enviada al cliente.
   */
  registrar(empresaId: string, data: RegistrarIncidenciaData) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.registroIncidencia.create({ data: { empresaId, ...data, contexto: data.contexto as Prisma.InputJsonValue } }),
    );
  }

  marcarResuelta(empresaId: string, id: string, notaResolucion?: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.registroIncidencia.update({
        where: { id, empresaId },
        data: { resuelto: true, notaResolucion },
      }),
    );
  }

  /**
   * Elimina incidencias resueltas con más de 90 días — llamado por el cron
   * diario y disponible para pruebas. Row-Level Security exige recorrer
   * empresa por empresa (con SET LOCAL app.current_tenant) — sin eso el
   * rol de aplicación (stockpro_app, sin BYPASSRLS) no ve ninguna fila.
   */
  async purgarResueltasAntiguas() {
    const limite = new Date();
    limite.setDate(limite.getDate() - DIAS_RETENCION_RESUELTAS);
    const empresas = await this.prisma.empresa.findMany({ select: { id: true } });

    let total = 0;
    for (const { id: empresaId } of empresas) {
      const { count } = await this.prisma.withTenant(empresaId, (tx) =>
        tx.registroIncidencia.deleteMany({
          where: { empresaId, resuelto: true, timestamp: { lt: limite } },
        }),
      );
      total += count;
    }
    if (total > 0) this.logger.log(`Purgadas ${total} incidencias resueltas con más de ${DIAS_RETENCION_RESUELTAS} días.`);
    return total;
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  purgaDiariaAutomatica() {
    return this.purgarResueltasAntiguas().catch((err) =>
      this.logger.error('Falló la purga automática de incidencias', err?.stack ?? String(err)),
    );
  }
}
