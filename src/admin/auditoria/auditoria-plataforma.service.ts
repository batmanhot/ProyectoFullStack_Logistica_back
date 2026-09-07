import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Auditoría de acciones del PlatformAdmin — ver PlatformAuditInterceptor, que es quien la llena. */
@Injectable()
export class AuditoriaPlataformaService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filtros: { limite?: number; empresaId?: string; recurso?: string } = {}) {
    return this.prisma.auditoriaPlataforma.findMany({
      where: {
        ...(filtros.empresaId && { empresaId: filtros.empresaId }),
        ...(filtros.recurso && { recurso: filtros.recurso }),
      },
      include: {
        admin: { select: { nombre: true, email: true } },
        empresa: { select: { nombre: true } },
      },
      orderBy: { timestamp: 'desc' },
      take: Math.min(filtros.limite ?? 50, 200),
    });
  }
}
