import { describe, expect, it } from 'vitest';
import { PERMISO_KEY } from '../common/decorators/permiso.decorator';
import { ListasPreciosController } from './listas-precios.controller';

/**
 * Segunda pasada del hallazgo de Proveedores/Clientes/Transportistas/
 * Productos (2026-09-12): Clientes.jsx asigna una lista de precios al
 * crear/editar un cliente, y Coordinador de Transporte tiene el módulo
 * completo 'clientes' pero no 'lista-precios' — con @Permiso a nivel de
 * clase ese selector quedaba vacío. Fix: lectura abierta, escritura
 * gateada (la política comercial de precios sigue siendo de
 * gerente-operaciones vía @SoloRoles, sin cambios).
 */
describe('ListasPreciosController — permisos por endpoint', () => {
  const permiso = (metodo: keyof ListasPreciosController) =>
    Reflect.getMetadata(PERMISO_KEY, ListasPreciosController.prototype[metodo]);

  it('no tiene @Permiso a nivel de clase', () => {
    expect(Reflect.getMetadata(PERMISO_KEY, ListasPreciosController)).toBeUndefined();
  });

  it('findAll/findOne quedan sin @Permiso (lectura abierta a cualquier rol autenticado)', () => {
    expect(permiso('findAll')).toBeUndefined();
    expect(permiso('findOne')).toBeUndefined();
  });

  it('toda escritura exige "lista-precios"', () => {
    for (const metodo of ['create', 'update', 'remove', 'setPrecio', 'duplicar'] as const) {
      expect(permiso(metodo)).toBe('lista-precios');
    }
  });
});
