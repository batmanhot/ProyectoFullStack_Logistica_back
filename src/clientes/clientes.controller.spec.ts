import { describe, expect, it } from 'vitest';
import { PERMISO_KEY } from '../common/decorators/permiso.decorator';
import { ClientesController } from './clientes.controller';

/**
 * Mismo hallazgo que Proveedores (2026-09-12): Despachos.jsx necesita listar
 * clientes para roles que operan despachos (Almacenero, Despachador, Chofer)
 * pero no tienen el módulo 'clientes' completo — con @Permiso a nivel de
 * clase el selector quedaba vacío. Fix: lectura abierta, escritura gateada
 * (mismo patrón que Almacenes/Categorías/Proyectos, Hallazgo Alto #7).
 */
describe('ClientesController — permisos por endpoint', () => {
  const permiso = (metodo: keyof ClientesController) =>
    Reflect.getMetadata(PERMISO_KEY, ClientesController.prototype[metodo]);

  it('no tiene @Permiso a nivel de clase', () => {
    expect(Reflect.getMetadata(PERMISO_KEY, ClientesController)).toBeUndefined();
  });

  it('findAll/findOne quedan sin @Permiso (lectura abierta a cualquier rol autenticado)', () => {
    expect(permiso('findAll')).toBeUndefined();
    expect(permiso('findOne')).toBeUndefined();
  });

  it('create/update/remove/generarPortalLink exigen "clientes"', () => {
    for (const metodo of ['create', 'update', 'remove', 'generarPortalLink'] as const) {
      expect(permiso(metodo)).toBe('clientes');
    }
  });
});
