import { TipoMovimiento } from '@prisma/client';

export type Direccion = 'incremento' | 'decremento';

export interface FilaInventarioDisponible {
  ubicacionId: string | null;
  cantidad: unknown;
  cantidadReservada: unknown;
}

/**
 * Stock disponible TOTAL de un producto en un almacén: suma el bucket sin
 * asignar (ubicacionId=null) más todo lo guardado en ubicaciones del Mapa
 * de Almacén. Solo el bucket sin asignar carga `cantidadReservada` (Despachos
 * reserva únicamente ahí) — las demás filas están 100% libres.
 */
export function calcularDisponibleTotal(filas: FilaInventarioDisponible[]): number {
  return filas.reduce((acc, f) => {
    const cantidad = Number(f.cantidad);
    const reservada = f.ubicacionId === null ? Number(f.cantidadReservada) : 0;
    return acc + (cantidad - reservada);
  }, 0);
}

export interface PreparacionMovimiento {
  /** Lo que se guarda en Movimiento.cantidad. Firmado SOLO para AJUSTE. */
  cantidadAlmacenada: number;
  /** Delta a aplicar en Inventario/stockActual del almacén de origen (almacenId). */
  deltaOrigen: number;
  /** Delta a aplicar en el almacén destino — solo distinto de 0 en TRANSFERENCIA. */
  deltaDestino: number;
  /** Delta neto a nivel compañía (Producto.stockActual, LoteProducto.cantidadActual). 0 en TRANSFERENCIA. */
  deltaTotal: number;
}

/**
 * Única fuente de verdad para el signo del impacto en stock al CREAR un
 * Movimiento. `cantidad` aquí es siempre la magnitud positiva que envía el
 * usuario (regla de negocio: "cantidad debe ser mayor a cero").
 *
 * Decisiones de Fase 3 (confirmadas con el usuario):
 *   - DEVOLUCION siempre se interpreta como devolución de CLIENTE → entra stock.
 *   - AJUSTE requiere `direccion` explícita ('incremento' | 'decremento') porque
 *     el enum TipoMovimiento no distingue sentido por sí mismo.
 */
export function prepararMovimiento(
  tipo: TipoMovimiento,
  cantidad: number,
  direccion?: Direccion,
): PreparacionMovimiento {
  switch (tipo) {
    case 'ENTRADA':
    case 'DEVOLUCION':
      return { cantidadAlmacenada: cantidad, deltaOrigen: cantidad, deltaDestino: 0, deltaTotal: cantidad };
    case 'SALIDA':
      return { cantidadAlmacenada: cantidad, deltaOrigen: -cantidad, deltaDestino: 0, deltaTotal: -cantidad };
    case 'AJUSTE': {
      const signo = direccion === 'decremento' ? -1 : 1;
      const delta = cantidad * signo;
      return { cantidadAlmacenada: delta, deltaOrigen: delta, deltaDestino: 0, deltaTotal: delta };
    }
    case 'TRANSFERENCIA':
      return { cantidadAlmacenada: cantidad, deltaOrigen: -cantidad, deltaDestino: cantidad, deltaTotal: 0 };
    default:
      throw new Error(`Tipo de movimiento no soportado: ${tipo}`);
  }
}

/**
 * Delta neto a nivel compañía leído desde un Movimiento YA PERSISTIDO
 * (usado por el Kardex cuando NO se filtra por almacén). AJUSTE ya viene
 * firmado en `cantidadAlmacenada` — por eso esta función NO recibe `direccion`.
 */
export function deltaTotalDesdeMovimiento(tipo: TipoMovimiento, cantidadAlmacenada: number): number {
  switch (tipo) {
    case 'ENTRADA':
    case 'DEVOLUCION':
    case 'AJUSTE':
      return cantidadAlmacenada;
    case 'SALIDA':
      return -cantidadAlmacenada;
    case 'TRANSFERENCIA':
      return 0;
    default:
      throw new Error(`Tipo de movimiento no soportado: ${tipo}`);
  }
}

/**
 * Delta visto desde UN almacén específico (Kardex filtrado por almacenId).
 * En TRANSFERENCIA, el mismo Movimiento aparece como salida en el almacén
 * origen y como entrada en el destino.
 */
export function deltaEnAlmacenDesdeMovimiento(
  tipo: TipoMovimiento,
  cantidadAlmacenada: number,
  almacenIdMovimiento: string,
  almacenDestinoIdMovimiento: string | null,
  almacenIdFiltro: string,
): number {
  if (tipo === 'TRANSFERENCIA') {
    if (almacenIdFiltro === almacenIdMovimiento) return -cantidadAlmacenada;
    if (almacenDestinoIdMovimiento && almacenIdFiltro === almacenDestinoIdMovimiento) return cantidadAlmacenada;
    return 0;
  }
  if (almacenIdFiltro !== almacenIdMovimiento) return 0;
  return deltaTotalDesdeMovimiento(tipo, cantidadAlmacenada);
}
