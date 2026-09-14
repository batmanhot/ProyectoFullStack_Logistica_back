import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface MarcarAtendidaInput {
  tipo: string;
  clave: string;
  notaAccion: string;
}

/**
 * Centro de Alertas (tenant) — seguimiento de atención (2026-09-13). Las
 * alertas en sí NO son filas de base de datos: se calculan en vivo en el
 * frontend (utils/alertas.js) a partir de datos reales (stock, OC,
 * despachos, etc.). Este servicio solo registra que un responsable la
 * ATENDIÓ y qué acción tomó. No confundir con `admin/alertas` (Centro de
 * Alertas del SuperAdmin — salud de la plataforma, otro dominio).
 */
@Injectable()
export class AtencionesAlertaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Todas las atenciones registradas del tenant — el frontend las cruza por
   * `tipo`+`clave` contra las alertas que calcula en vivo.
   */
  listar(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.atencionAlerta.findMany({
        where: { empresaId },
        include: { usuario: { select: { nombre: true } } },
        orderBy: { fecha: 'desc' },
      }),
    );
  }

  /** Upsert por [empresaId, tipo, clave] — marca o re-marca (nueva nota/fecha/usuario) como atendida. */
  marcarAtendida(empresaId: string, usuarioId: string, dto: MarcarAtendidaInput) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.atencionAlerta.upsert({
        where: { empresaId_tipo_clave: { empresaId, tipo: dto.tipo, clave: dto.clave } },
        create: { empresaId, tipo: dto.tipo, clave: dto.clave, notaAccion: dto.notaAccion, usuarioId },
        update: { notaAccion: dto.notaAccion, usuarioId, fecha: new Date() },
        include: { usuario: { select: { nombre: true } } },
      }),
    );
  }

  /** Vuelve la alerta a "Pendiente" (por si se marcó atendida por error). */
  async reabrir(empresaId: string, tipo: string, clave: string): Promise<{ ok: true }> {
    await this.prisma.withTenant(empresaId, (tx) =>
      tx.atencionAlerta.deleteMany({ where: { empresaId, tipo, clave } }),
    );
    return { ok: true };
  }
}
