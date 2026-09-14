import { describe, expect, it } from 'vitest';
import { PERMISO_KEY } from '../common/decorators/permiso.decorator';
import { ProveedoresController } from './proveedores.controller';

/**
 * Bug real reportado 2026-09-12: Almacenero (permiso 'inventario'/'entradas'
 * pero sin 'proveedores') veía el selector de proveedor vacío ("Sin
 * proveedor") en Nuevo Producto pese a haber proveedores registrados — el
 * @Permiso('proveedores') a nivel de clase gateaba también la LECTURA
 * (findAll/findOne), y el fetch fallaba en silencio (403 → array vacío en
 * el frontend). Fix: mismo patrón que Almacenes/Categorías/Proyectos
 * (Hallazgo Alto #7, auditoría 2026-07-29) — lectura abierta, escritura
 * gateada. Este spec fija esa forma para atrapar una regresión futura.
 */
describe('ProveedoresController — permisos por endpoint', () => {
  const permiso = (metodo: keyof ProveedoresController) =>
    Reflect.getMetadata(PERMISO_KEY, ProveedoresController.prototype[metodo]);

  it('no tiene @Permiso a nivel de clase', () => {
    expect(Reflect.getMetadata(PERMISO_KEY, ProveedoresController)).toBeUndefined();
  });

  it('findAll/findOne quedan sin @Permiso (lectura abierta a cualquier rol autenticado)', () => {
    expect(permiso('findAll')).toBeUndefined();
    expect(permiso('findOne')).toBeUndefined();
  });

  it('create/update/remove/generarPortalLink exigen "proveedores"', () => {
    for (const metodo of ['create', 'update', 'remove', 'generarPortalLink'] as const) {
      expect(permiso(metodo)).toBe('proveedores');
    }
  });
});
