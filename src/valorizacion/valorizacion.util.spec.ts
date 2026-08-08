/**
 * Port literal de front/logistica/src/utils/valorizacion.test.js — mismos
 * casos, mismos resultados esperados. Si el algoritmo cambia, sincronizar
 * ambos lados (ver comentario en valorizacion.util.ts).
 */
import { describe, it, expect } from 'vitest';
import {
  calcularPMP,
  salida_PMP,
  salida_FIFO,
  salida_LIFO,
  procesarSalida,
  valorarStock,
  round2,
  Batch,
} from './valorizacion.util';

// ── Fixtures ────────────────────────────────────────────────
const batchesSimples: Batch[] = [
  { cantidad: 10, costo: 100, fecha: '2024-01-01' },
  { cantidad: 10, costo: 200, fecha: '2024-02-01' },
];

// ── calcularPMP ─────────────────────────────────────────────
describe('calcularPMP', () => {
  it('calcula el promedio ponderado correctamente', () => {
    expect(calcularPMP(batchesSimples)).toBe(150);
  });

  it('devuelve 0 si no hay batches', () => {
    expect(calcularPMP([])).toBe(0);
  });

  it('devuelve el costo del único batch cuando hay uno solo', () => {
    expect(calcularPMP([{ cantidad: 5, costo: 80 }])).toBe(80);
  });
});

// ── salida_PMP ──────────────────────────────────────────────
describe('salida_PMP', () => {
  it('reduce el stock y retorna el costo promedio ponderado', () => {
    const resultado = salida_PMP(batchesSimples, 5);
    expect(resultado.costoUnitario).toBe(150);
    expect(resultado.costoTotal).toBe(750);
    const stockRestante = resultado.batches.reduce((s, b) => s + b.cantidad, 0);
    expect(round2(stockRestante)).toBe(15);
  });

  it('lanza error si se pide más de lo disponible', () => {
    expect(() => salida_PMP(batchesSimples, 25)).toThrow('Stock insuficiente');
  });

  it('consume todo el stock sin dejar residuos', () => {
    const resultado = salida_PMP(batchesSimples, 20);
    expect(resultado.batches.length).toBe(0);
    expect(resultado.costoTotal).toBe(3000);
  });
});

// ── salida_FIFO ─────────────────────────────────────────────
describe('salida_FIFO', () => {
  it('consume primero los lotes más antiguos', () => {
    const resultado = salida_FIFO(batchesSimples, 10);
    expect(resultado.costoUnitario).toBe(100);
    expect(resultado.costoTotal).toBe(1000);
    expect(resultado.batches.length).toBe(1);
    expect(resultado.batches[0].costo).toBe(200);
  });

  it('lanza error si se pide más de lo disponible', () => {
    expect(() => salida_FIFO(batchesSimples, 30)).toThrow('Stock insuficiente');
  });

  it('devuelve costoUnitario 0 cuando cantidadSalida es 0', () => {
    const resultado = salida_FIFO(batchesSimples, 0);
    expect(resultado.costoUnitario).toBe(0);
    expect(resultado.costoTotal).toBe(0);
    expect(resultado.batches.length).toBe(batchesSimples.length);
  });

  it('mezcla lotes cuando la cantidad cruza un batch', () => {
    const resultado = salida_FIFO(batchesSimples, 15);
    expect(resultado.costoTotal).toBe(2000);
    expect(round2(resultado.costoUnitario)).toBe(133.33);
  });
});

// ── salida_LIFO ─────────────────────────────────────────────
describe('salida_LIFO', () => {
  it('consume primero los lotes más recientes', () => {
    const resultado = salida_LIFO(batchesSimples, 10);
    expect(resultado.costoUnitario).toBe(200);
    expect(resultado.costoTotal).toBe(2000);
    expect(resultado.batches.length).toBe(1);
    expect(resultado.batches[0].costo).toBe(100);
  });
});

// ── procesarSalida (dispatcher) ─────────────────────────────
describe('procesarSalida', () => {
  it('usa PMP por defecto', () => {
    const pmp = salida_PMP(batchesSimples, 5);
    const result = procesarSalida(batchesSimples, 5);
    expect(result.costoUnitario).toBe(pmp.costoUnitario);
  });

  it('despacha correctamente a FIFO', () => {
    const fifo = salida_FIFO(batchesSimples, 5);
    const result = procesarSalida(batchesSimples, 5, 'FIFO');
    expect(result.costoUnitario).toBe(fifo.costoUnitario);
  });

  it('despacha correctamente a LIFO', () => {
    const lifo = salida_LIFO(batchesSimples, 5);
    const result = procesarSalida(batchesSimples, 5, 'LIFO');
    expect(result.costoUnitario).toBe(lifo.costoUnitario);
  });
});

// ── valorarStock ────────────────────────────────────────────
describe('valorarStock', () => {
  it('retorna 0 para batches vacíos', () => {
    expect(valorarStock([], 'PMP')).toBe(0);
    expect(valorarStock(null, 'FIFO')).toBe(0);
  });

  it('calcula valor correcto con PMP', () => {
    expect(valorarStock(batchesSimples, 'PMP')).toBe(3000);
  });

  it('calcula valor correcto con FIFO / LIFO (suma directa de lotes)', () => {
    expect(valorarStock(batchesSimples, 'FIFO')).toBe(3000);
    expect(valorarStock(batchesSimples, 'LIFO')).toBe(3000);
  });

  it('rama default: fórmula desconocida se comporta como suma directa', () => {
    expect(valorarStock(batchesSimples, 'DESCONOCIDA' as any)).toBe(3000);
  });
});

// ── round2 ──────────────────────────────────────────────────
describe('round2', () => {
  it('redondea correctamente a 2 decimales', () => {
    expect(round2(1.005)).toBe(1.0);
    expect(round2(1.006)).toBe(1.01);
    expect(round2(1.004)).toBe(1.0);
    expect(round2(1.555)).toBe(1.56);
    expect(round2(100)).toBe(100);
    expect(round2(0.125)).toBe(0.13);
  });
});
