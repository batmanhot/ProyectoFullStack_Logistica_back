import { describe, expect, it } from 'vitest';
import { PERMISO_KEY } from '../common/decorators/permiso.decorator';
import { ProductosController } from './productos.controller';

/**
 * Mismo hallazgo que Proveedores/Clientes/Transportistas (2026-09-12), y
 * más crítico: Despachos.jsx usa /productos tanto para armar un pedido
 * nuevo como para resolver el NOMBRE del producto en el detalle de
 * despachos ya existentes (prodMap) — Despachador y Chofer tienen
 * 'despachos' pero no 'inventario', así que con @Permiso a nivel de clase
 * se quedaban con productos en blanco al abrir cualquier despacho, no solo
 * al crear uno. Fix: lectura abierta, escritura gateada (mismo patrón que
 * Almacenes/Categorías/Proyectos, Hallazgo Alto #7).
 */
describe('ProductosController — permisos por endpoint', () => {
  const permiso = (metodo: keyof ProductosController) =>
    Reflect.getMetadata(PERMISO_KEY, ProductosController.prototype[metodo]);

  it('no tiene @Permiso a nivel de clase', () => {
    expect(Reflect.getMetadata(PERMISO_KEY, ProductosController)).toBeUndefined();
  });

  it('findAll/findOne quedan sin @Permiso (lectura abierta a cualquier rol autenticado)', () => {
    expect(permiso('findAll')).toBeUndefined();
    expect(permiso('findOne')).toBeUndefined();
  });

  it('create/update/remove exigen "inventario"', () => {
    for (const metodo of ['create', 'update', 'remove'] as const) {
      expect(permiso(metodo)).toBe('inventario');
    }
  });
});
