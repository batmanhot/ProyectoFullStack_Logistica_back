import { describe, expect, it } from 'vitest';
import { PERMISO_KEY } from '../common/decorators/permiso.decorator';
import { OrdenesCompraController } from './ordenes-compra.controller';

/**
 * Segunda pasada del hallazgo de Proveedores/Clientes/Transportistas/
 * Productos (2026-09-12): Alertas.jsx calcula "OC pendiente" para cualquier
 * rol que no sea chofer/ejecutivo-comercial/coordinador-transporte/contable
 * — eso incluye Admin y Gerente de Operaciones (perdieron 'ordenes' con el
 * Alcance de roles 2026-09-11) y Supervisor/Despachador (nunca lo tuvieron).
 * Fix: lectura abierta, escritura gateada.
 */
describe('OrdenesCompraController — permisos por endpoint', () => {
  const permiso = (metodo: keyof OrdenesCompraController) =>
    Reflect.getMetadata(PERMISO_KEY, OrdenesCompraController.prototype[metodo]);

  it('no tiene @Permiso a nivel de clase', () => {
    expect(Reflect.getMetadata(PERMISO_KEY, OrdenesCompraController)).toBeUndefined();
  });

  it('findAll/findOne quedan sin @Permiso (lectura abierta a cualquier rol autenticado)', () => {
    expect(permiso('findAll')).toBeUndefined();
    expect(permiso('findOne')).toBeUndefined();
  });

  it('toda escritura/acción exige "ordenes"', () => {
    for (const metodo of [
      'create', 'update', 'recibir', 'agregarGasto', 'eliminarGasto', 'actualizarEstadoLogistico',
    ] as const) {
      expect(permiso(metodo)).toBe('ordenes');
    }
  });
});
