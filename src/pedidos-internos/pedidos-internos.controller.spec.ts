import { describe, expect, it } from 'vitest';
import { PERMISO_KEY } from '../common/decorators/permiso.decorator';
import { PedidosInternosController } from './pedidos-internos.controller';

/**
 * Alcance de roles (2026-09-11): el controller dejó de tener un único
 * @Permiso('pedidos-internos') a nivel de clase — cada endpoint declara el
 * suyo, para que Admin Tenant pueda aprobar/rechazar sin el módulo
 * completo. Este spec fija qué permiso lleva cada uno.
 */
describe('PedidosInternosController — permisos por endpoint', () => {
  const permiso = (metodo: keyof PedidosInternosController) =>
    Reflect.getMetadata(PERMISO_KEY, PedidosInternosController.prototype[metodo]);

  it('no tiene @Permiso a nivel de clase', () => {
    expect(Reflect.getMetadata(PERMISO_KEY, PedidosInternosController)).toBeUndefined();
  });

  it('findAll/findOne/productos-disponibles aceptan el permiso completo O el angosto de aprobar', () => {
    expect(permiso('findAll')).toEqual(['pedidos-internos', 'pedidos-internos-aprobar']);
    expect(permiso('findOne')).toEqual(['pedidos-internos', 'pedidos-internos-aprobar']);
    expect(permiso('productosDisponibles')).toEqual(['pedidos-internos', 'pedidos-internos-aprobar']);
  });

  it('aprobar/rechazar aceptan el permiso completo O el angosto', () => {
    expect(permiso('aprobar')).toEqual(['pedidos-internos', 'pedidos-internos-aprobar']);
    expect(permiso('rechazar')).toEqual(['pedidos-internos', 'pedidos-internos-aprobar']);
  });

  it('los endpoints de operar exigen el módulo completo', () => {
    for (const metodo of [
      'create', 'update', 'enviar', 'marcarPicking', 'entregar', 'confirmarRecibo',
    ] as const) {
      expect(permiso(metodo)).toBe('pedidos-internos');
    }
  });
});
