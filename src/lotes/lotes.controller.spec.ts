import { describe, expect, it } from 'vitest';
import { PERMISO_KEY } from '../common/decorators/permiso.decorator';
import { LotesController } from './lotes.controller';

/**
 * Segunda pasada del hallazgo de Proveedores/Clientes/Transportistas/
 * Productos (2026-09-12): Alertas.jsx calcula "lote por vencer" para
 * cualquier rol que no sea chofer/ejecutivo-comercial/coordinador-
 * transporte/contable — eso incluye Admin y Gerente de Operaciones
 * (perdieron 'lotes-series' con el Alcance de roles 2026-09-11) y
 * Despachador/Analista de Compras (nunca lo tuvieron). Fix: lectura
 * abierta, escritura gateada.
 */
describe('LotesController — permisos por endpoint', () => {
  const permiso = (metodo: keyof LotesController) =>
    Reflect.getMetadata(PERMISO_KEY, LotesController.prototype[metodo]);

  it('no tiene @Permiso a nivel de clase', () => {
    expect(Reflect.getMetadata(PERMISO_KEY, LotesController)).toBeUndefined();
  });

  it('findAll/findOne quedan sin @Permiso (lectura abierta a cualquier rol autenticado)', () => {
    expect(permiso('findAll')).toBeUndefined();
    expect(permiso('findOne')).toBeUndefined();
  });

  it('create/update/remove exigen "lotes-series"', () => {
    for (const metodo of ['create', 'update', 'remove'] as const) {
      expect(permiso(metodo)).toBe('lotes-series');
    }
  });
});
