import { PrismaClient } from '@prisma/client';

interface CrearCapaEntradaParams {
  empresaId: string;
  productoId: string;
  loteId: string | null | undefined;
  movimientoId: string;
  cantidad: number;
  costoUnitario: number;
}

/**
 * Crea una CapaCosto al confirmarse una entrada de stock (ENTRADA,
 * DEVOLUCION de cliente, o AJUSTE con dirección incremento) — solo cuando
 * la empresa tiene costeoAutomatico=true (kill-switch de rollout, ver
 * Empresa.costeoAutomatico en schema.prisma) y viene un costoUnitario real.
 * Sin costo no hay nada que "apilar" — se omite en silencio, no bloquea
 * la operación (ej. Entradas.jsx manual sin costo especificado).
 *
 * Fase 3 (pendiente, no implementada acá) consumirá estas capas en cada
 * SALIDA/AJUSTE-decremento según Empresa.formulaValorizacion.
 */
export async function crearCapaEntrada(tx: PrismaClient, params: CrearCapaEntradaParams) {
  if (params.costoUnitario == null) return;

  await tx.capaCosto.create({
    data: {
      empresaId: params.empresaId,
      productoId: params.productoId,
      loteId: params.loteId ?? null,
      movimientoEntradaId: params.movimientoId,
      cantidadOriginal: params.cantidad,
      cantidadDisponible: params.cantidad,
      costoUnitario: params.costoUnitario,
    },
  });
}
