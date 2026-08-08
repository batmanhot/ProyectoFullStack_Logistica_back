/**
 * StockPro — Motor de Valorización de Inventario (PMP/FIFO/LIFO)
 *
 * Port 1:1 de front/logistica/src/utils/valorizacion.js (Fase 1 del plan de
 * conexión real del motor, 2026-08-08) — mismas firmas y semántica. Fuente
 * de verdad autoritativa: corre acá porque un request HTTP no debe poder
 * inventar su propio costo de salida, y las transacciones de Postgres
 * evitan condiciones de carrera entre salidas concurrentes del mismo
 * producto. El archivo original del frontend queda como preview optimista
 * (Fase 6) — si el algoritmo cambia, sincronizar ambos lados.
 */

export interface Batch {
  cantidad: number;
  costo: number;
  fecha?: string | Date;
}

export interface ResultadoSalida {
  batches: Batch[];
  costoUnitario: number;
  costoTotal: number;
}

export type FormulaValorizacion = 'PMP' | 'FIFO' | 'LIFO';

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─────────────────────────────────────────────
// PMP — Precio Medio Ponderado (default Perú)
// ─────────────────────────────────────────────
export function calcularPMP(batches: Batch[]): number {
  const totalUnidades = batches.reduce((s, b) => s + b.cantidad, 0);
  const totalValor = batches.reduce((s, b) => s + b.cantidad * b.costo, 0);
  if (totalUnidades === 0) return 0;
  return totalValor / totalUnidades;
}

/**
 * Aplica una salida con PMP: el costo promedio se recalcula ANTES de cada entrada.
 */
export function salida_PMP(batches: Batch[], cantidadSalida: number): ResultadoSalida {
  const costoUnitario = calcularPMP(batches);
  const totalStock = batches.reduce((s, b) => s + b.cantidad, 0);

  if (cantidadSalida > totalStock) {
    throw new Error(`Stock insuficiente: disponible ${totalStock}, solicitado ${cantidadSalida}`);
  }

  // Con PMP todos los lotes se mezclan — reducimos proporcionalmente
  const factor = (totalStock - cantidadSalida) / totalStock;
  const nuevoBatch = batches
    .map((b) => ({ ...b, cantidad: b.cantidad * factor }))
    .filter((b) => b.cantidad > 0.0001);

  return {
    batches: nuevoBatch,
    costoUnitario: round2(costoUnitario),
    costoTotal: round2(costoUnitario * cantidadSalida),
  };
}

// ─────────────────────────────────────────────
// FIFO — First In, First Out / PEPS
// ─────────────────────────────────────────────
export function salida_FIFO(batches: Batch[], cantidadSalida: number): ResultadoSalida {
  const ordenados = [...batches].sort(
    (a, b) => new Date(a.fecha ?? 0).getTime() - new Date(b.fecha ?? 0).getTime(),
  );
  return _procesar_salida(ordenados, cantidadSalida);
}

// ─────────────────────────────────────────────
// LIFO — Last In, First Out / UEPS
// ─────────────────────────────────────────────
export function salida_LIFO(batches: Batch[], cantidadSalida: number): ResultadoSalida {
  const ordenados = [...batches].sort(
    (a, b) => new Date(b.fecha ?? 0).getTime() - new Date(a.fecha ?? 0).getTime(),
  );
  return _procesar_salida(ordenados, cantidadSalida);
}

// ─────────────────────────────────────────────
// Dispatcher — elige la fórmula según config
// ─────────────────────────────────────────────
export function procesarSalida(
  batches: Batch[],
  cantidad: number,
  formula: FormulaValorizacion = 'PMP',
): ResultadoSalida {
  switch (formula) {
    case 'FIFO':
      return salida_FIFO(batches, cantidad);
    case 'LIFO':
      return salida_LIFO(batches, cantidad);
    case 'PMP':
    default:
      return salida_PMP(batches, cantidad);
  }
}

/**
 * Calcula el valor total del stock actual según la fórmula
 */
export function valorarStock(batches: Batch[] | null | undefined, formula: FormulaValorizacion = 'PMP'): number {
  if (!batches || batches.length === 0) return 0;

  switch (formula) {
    case 'PMP': {
      const pmp = calcularPMP(batches);
      const tot = batches.reduce((s, b) => s + b.cantidad, 0);
      return round2(pmp * tot);
    }
    case 'FIFO': {
      return round2(batches.reduce((s, b) => s + b.cantidad * b.costo, 0));
    }
    case 'LIFO': {
      return round2(batches.reduce((s, b) => s + b.cantidad * b.costo, 0));
    }
    default:
      return round2(batches.reduce((s, b) => s + b.cantidad * b.costo, 0));
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function _procesar_salida(batchesOrdenados: Batch[], cantidadSalida: number): ResultadoSalida {
  let restante = cantidadSalida;
  let costoTotal = 0;

  const copia = batchesOrdenados.map((b) => ({ ...b }));
  const totalStock = copia.reduce((s, b) => s + b.cantidad, 0);

  if (cantidadSalida > totalStock) {
    throw new Error(`Stock insuficiente: disponible ${totalStock}, solicitado ${cantidadSalida}`);
  }

  for (const batch of copia) {
    if (restante <= 0) break;
    const usar = Math.min(batch.cantidad, restante);
    costoTotal += usar * batch.costo;
    batch.cantidad -= usar;
    restante -= usar;
  }

  // Los batches originales con cantidades restantes (sin los agotados)
  const nuevoBatches = copia.filter((b) => b.cantidad > 0.0001);
  const costoUnitario = cantidadSalida > 0 ? costoTotal / cantidadSalida : 0;

  return {
    batches: nuevoBatches,
    costoUnitario: round2(costoUnitario),
    costoTotal: round2(costoTotal),
  };
}
