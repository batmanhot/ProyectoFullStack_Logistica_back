import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PanelAuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Líneas de Inventario Físico con diferencia real (stockSistema vs.
   * stockFisico) a través de todos los conteos de la empresa — no existe
   * este agregado en InventarioFisicoService, que solo expone un conteo a
   * la vez. Es una query de solo lectura, no toca el motor de ajustes.
   */
  discrepancias(empresaId: string, filtros: { almacenId?: string } = {}) {
    // Corrección de la auditoría de seguridad 2026-07-29: esto llamaba a
    // this.prisma directo, sin pasar por withTenant() (sin SET LOCAL
    // app.current_tenant). Mientras Row-Level Security era un no-op
    // (Hallazgo Crítico #1) esto "funcionaba" por accidente — filtrando
    // correctamente por el WHERE de arriba. Ahora que RLS aplica de verdad,
    // sin este SET LOCAL la política de inventario_fisico_lineas (que exige
    // el contexto de tenant) no vería ninguna fila.
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.inventarioFisicoLinea.findMany({
        where: {
          diferencia: { not: null },
          AND: [{ diferencia: { not: 0 } }],
          inventario: {
            empresaId,
            ...(filtros.almacenId && { almacenId: filtros.almacenId }),
          },
        },
        select: {
          id: true,
          stockSistema: true,
          stockFisico: true,
          diferencia: true,
          ajustado: true,
          producto: { select: { sku: true, nombre: true } },
          inventario: {
            select: {
              numero: true,
              fecha: true,
              almacen: { select: { nombre: true } },
            },
          },
        },
        orderBy: { inventario: { fecha: 'desc' } },
        take: 500,
      }),
    );
  }
}
