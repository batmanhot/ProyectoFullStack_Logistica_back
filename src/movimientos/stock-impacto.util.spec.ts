import { describe, it, expect } from 'vitest';
import {
  prepararMovimiento,
  deltaTotalDesdeMovimiento,
  deltaEnAlmacenDesdeMovimiento,
} from './stock-impacto.util';

describe('prepararMovimiento — al CREAR un Movimiento', () => {
  it('ENTRADA suma stock en origen y a nivel compañía', () => {
    expect(prepararMovimiento('ENTRADA', 10)).toEqual({
      cantidadAlmacenada: 10,
      deltaOrigen: 10,
      deltaDestino: 0,
      deltaTotal: 10,
    });
  });

  it('SALIDA resta stock en origen y a nivel compañía', () => {
    expect(prepararMovimiento('SALIDA', 10)).toEqual({
      cantidadAlmacenada: 10,
      deltaOrigen: -10,
      deltaDestino: 0,
      deltaTotal: -10,
    });
  });

  it('DEVOLUCION siempre suma (decisión de Fase 3: devolución de cliente)', () => {
    expect(prepararMovimiento('DEVOLUCION', 5)).toEqual({
      cantidadAlmacenada: 5,
      deltaOrigen: 5,
      deltaDestino: 0,
      deltaTotal: 5,
    });
  });

  it('AJUSTE incremento suma y guarda cantidadAlmacenada positiva', () => {
    expect(prepararMovimiento('AJUSTE', 3, 'incremento')).toEqual({
      cantidadAlmacenada: 3,
      deltaOrigen: 3,
      deltaDestino: 0,
      deltaTotal: 3,
    });
  });

  it('AJUSTE decremento resta y guarda cantidadAlmacenada NEGATIVA (firmada en BD)', () => {
    expect(prepararMovimiento('AJUSTE', 3, 'decremento')).toEqual({
      cantidadAlmacenada: -3,
      deltaOrigen: -3,
      deltaDestino: 0,
      deltaTotal: -3,
    });
  });

  it('TRANSFERENCIA resta en origen, suma en destino, neutro a nivel compañía', () => {
    expect(prepararMovimiento('TRANSFERENCIA', 7)).toEqual({
      cantidadAlmacenada: 7,
      deltaOrigen: -7,
      deltaDestino: 7,
      deltaTotal: 0,
    });
  });
});

describe('deltaTotalDesdeMovimiento — al leer el Kardex sin filtro de almacén', () => {
  it('ENTRADA/DEVOLUCION/AJUSTE devuelven cantidadAlmacenada tal cual', () => {
    expect(deltaTotalDesdeMovimiento('ENTRADA', 10)).toBe(10);
    expect(deltaTotalDesdeMovimiento('DEVOLUCION', 10)).toBe(10);
    expect(deltaTotalDesdeMovimiento('AJUSTE', -4)).toBe(-4); // ya viene firmado
    expect(deltaTotalDesdeMovimiento('AJUSTE', 4)).toBe(4);
  });

  it('SALIDA invierte el signo', () => {
    expect(deltaTotalDesdeMovimiento('SALIDA', 10)).toBe(-10);
  });

  it('TRANSFERENCIA es neutra a nivel compañía', () => {
    expect(deltaTotalDesdeMovimiento('TRANSFERENCIA', 10)).toBe(0);
  });
});

describe('deltaEnAlmacenDesdeMovimiento — Kardex filtrado por almacenId', () => {
  it('TRANSFERENCIA aparece como salida en el almacén origen', () => {
    const delta = deltaEnAlmacenDesdeMovimiento('TRANSFERENCIA', 8, 'almacen-A', 'almacen-B', 'almacen-A');
    expect(delta).toBe(-8);
  });

  it('TRANSFERENCIA aparece como entrada en el almacén destino', () => {
    const delta = deltaEnAlmacenDesdeMovimiento('TRANSFERENCIA', 8, 'almacen-A', 'almacen-B', 'almacen-B');
    expect(delta).toBe(8);
  });

  it('TRANSFERENCIA no afecta a un almacén que no participa', () => {
    const delta = deltaEnAlmacenDesdeMovimiento('TRANSFERENCIA', 8, 'almacen-A', 'almacen-B', 'almacen-C');
    expect(delta).toBe(0);
  });

  it('un Movimiento normal (ENTRADA) no afecta a un almacén distinto al suyo', () => {
    const delta = deltaEnAlmacenDesdeMovimiento('ENTRADA', 8, 'almacen-A', null, 'almacen-Z');
    expect(delta).toBe(0);
  });

  it('un Movimiento normal (SALIDA) sí afecta a su propio almacén', () => {
    const delta = deltaEnAlmacenDesdeMovimiento('SALIDA', 8, 'almacen-A', null, 'almacen-A');
    expect(delta).toBe(-8);
  });
});
