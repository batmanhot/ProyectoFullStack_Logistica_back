import { describe, expect, it } from 'vitest';
import { PERMISO_KEY } from '../common/decorators/permiso.decorator';
import { TransportistasController } from './transportistas.controller';

/**
 * Mismo hallazgo que Proveedores/Clientes (2026-09-12): Despachos.jsx
 * necesita listar transportistas para asignar guía, incluso para roles como
 * Almacenero que operan despachos pero no tienen el módulo 'transportes'
 * completo — con @Permiso a nivel de clase el selector quedaba vacío. Fix:
 * lectura abierta, escritura gateada (mismo patrón que Almacenes/
 * Categorías/Proyectos, Hallazgo Alto #7).
 */
describe('TransportistasController — permisos por endpoint', () => {
  const permiso = (metodo: keyof TransportistasController) =>
    Reflect.getMetadata(PERMISO_KEY, TransportistasController.prototype[metodo]);

  it('no tiene @Permiso a nivel de clase', () => {
    expect(Reflect.getMetadata(PERMISO_KEY, TransportistasController)).toBeUndefined();
  });

  it('findAll/findOne quedan sin @Permiso (lectura abierta a cualquier rol autenticado)', () => {
    expect(permiso('findAll')).toBeUndefined();
    expect(permiso('findOne')).toBeUndefined();
  });

  it('create/update/remove exigen "transportes"', () => {
    for (const metodo of ['create', 'update', 'remove'] as const) {
      expect(permiso(metodo)).toBe('transportes');
    }
  });
});
