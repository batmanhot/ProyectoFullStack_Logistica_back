import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditoriaFiltros {
  busqueda?: string;
  accion?: string;
  modulo?: string;
  usuarioId?: string;
  desde?: string;
  hasta?: string;
}

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, filtros: AuditoriaFiltros = {}) {
    const { busqueda, accion, modulo, usuarioId, desde, hasta } = filtros;

    return this.prisma.withTenant(empresaId, (tx) =>
      tx.auditoria.findMany({
        where: {
          empresaId,
          ...(accion     && { accion }),
          ...(modulo     && { modulo }),
          ...(usuarioId  && { usuarioId }),
          ...(busqueda   && { detalle: { contains: busqueda, mode: 'insensitive' } }),
          ...(desde || hasta
            ? {
                timestamp: {
                  ...(desde && { gte: new Date(desde) }),
                  ...(hasta && { lte: new Date(`${hasta}T23:59:59.999Z`) }),
                },
              }
            : {}),
        },
        orderBy: { timestamp: 'desc' },
        take: 1000, // límite razonable — la UI filtra client-side adicionalmente
      }),
    );
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
