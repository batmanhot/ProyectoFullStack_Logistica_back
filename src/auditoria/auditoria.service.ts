import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditoriaFiltros {
  busqueda?: string;
  accion?: string;
  modulo?: string;
  usuarioId?: string;
  desde?: string;
  hasta?: string;
}

export interface AuditoriaPaginacion {
  page?: number;
  pageSize?: number;
}

const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 1000; // mismo tope que el `take` fijo que reemplaza

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, filtros: AuditoriaFiltros = {}, paginacion: AuditoriaPaginacion = {}) {
    const { busqueda, accion, modulo, usuarioId, desde, hasta } = filtros;
    const page = Math.max(1, paginacion.page ?? 1);
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, paginacion.pageSize ?? PAGE_SIZE_DEFAULT));

    const where: Prisma.AuditoriaWhereInput = {
      empresaId,
      ...(accion    && { accion }),
      ...(modulo    && { modulo }),
      ...(usuarioId && { usuarioId }),
      ...(busqueda  && { detalle: { contains: busqueda, mode: 'insensitive' } }),
      ...(desde || hasta
        ? {
            timestamp: {
              ...(desde && { gte: new Date(desde) }),
              ...(hasta && { lte: new Date(`${hasta}T23:59:59.999Z`) }),
            },
          }
        : {}),
    };

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy);
    manana.setDate(hoy.getDate() + 1);

    return this.prisma.withTenant(empresaId, async (tx) => {
      const [data, total, hoyCount, erroresCount, usuariosDistintos] = await Promise.all([
        tx.auditoria.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.auditoria.count({ where }),
        // "Eventos hoy" respeta los demás filtros (acción/módulo/usuario/búsqueda) además del rango de hoy.
        tx.auditoria.count({ where: { AND: [where, { timestamp: { gte: hoy, lt: manana } }] } }),
        tx.auditoria.count({ where: { AND: [where, { accion: { in: ['LOGIN_FAILED', 'DELETE'] } }] } }),
        tx.auditoria.findMany({ where, select: { usuarioId: true }, distinct: ['usuarioId'] }),
      ]);

      return {
        data,
        total,
        page,
        pageSize,
        kpis: {
          total,
          hoy: hoyCount,
          errores: erroresCount,
          usuarios: usuariosDistintos.filter((u) => u.usuarioId).length,
        },
      };
    });
  }

  /** Registra un evento de auditoría — llamado internamente por otros servicios. */
  registrar(
    empresaId: string,
    data: {
      usuarioId?: string;
      usuarioNombre: string;
      accion: string;
      modulo: string;
      detalle: string;
      datos?: object;
    },
  ) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.auditoria.create({ data: { empresaId, ...data } }),
    );
  }

  /** Elimina todos los registros de auditoría del tenant. */
  limpiar(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.auditoria.deleteMany({ where: { empresaId } }),
    );
  }
}
