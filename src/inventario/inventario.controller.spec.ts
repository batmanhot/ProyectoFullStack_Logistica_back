import { describe, expect, it } from 'vitest';
import { PERMISO_KEY } from '../common/decorators/permiso.decorator';
import { InventarioController } from './inventario.controller';

/**
 * Encontrado 2026-09-12: único endpoint del controller (findAll, stock por
 * producto/almacén), sin escritura que proteger — mismo criterio que
 * Almacenes/Categorías/Proyectos. Despachos.jsx/PedidosInternos/index.jsx
 * lo necesitan para roles sin el módulo 'inventario' completo.
 */
describe('InventarioController — permisos por endpoint', () => {
  it('no tiene @Permiso, ni a nivel de clase ni de método (lectura abierta)', () => {
    expect(Reflect.getMetadata(PERMISO_KEY, InventarioController)).toBeUndefined();
    expect(Reflect.getMetadata(PERMISO_KEY, InventarioController.prototype.findAll)).toBeUndefined();
  });
});
