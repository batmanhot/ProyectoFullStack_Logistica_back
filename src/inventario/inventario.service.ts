import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventarioService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Solo lectura — nunca se expone create/update/delete aquí. Inventario
   * se modifica ÚNICAMENTE como efecto secundario de un Movimiento
   * (ver MovimientosService), para no romper la trazabilidad que el
   * Hallazgo #1 justamente busca arreglar.
   */
  findAll(empresaId: string, filtros: { productoId?: string; almacenId?: string } = {}) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.inventario.findMany({
        where: {
          producto: { empresaId },
          ...(filtros.productoId && { productoId: filtros.productoId }),
          ...(filtros.almacenId && { almacenId: filtros.almacenId }),
        },
        include: {
          producto: { select: { sku: true, nombre: true } },
          almacen: { select: { nombre: true } },
          ubicacion: { select: { codigo: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    );
  }
}
