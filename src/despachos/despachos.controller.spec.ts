import { describe, expect, it } from 'vitest';
import { PERMISO_KEY } from '../common/decorators/permiso.decorator';
import { DespachosController } from './despachos.controller';

/**
 * Alcance de roles (2026-09-11): el controller dejó de tener un único
 * @Permiso('despachos') a nivel de clase — cada endpoint declara el suyo,
 * para que Admin Tenant pueda aprobar sin el módulo completo. Este spec
 * fija qué permiso lleva cada uno, para atrapar un futuro "me olvidé de
 * mover/agregar el decorador" (un error silencioso: el endpoint seguiría
 * respondiendo, solo que con el gating equivocado).
 */
describe('DespachosController — permisos por endpoint', () => {
  const permiso = (metodo: keyof DespachosController) =>
    Reflect.getMetadata(PERMISO_KEY, DespachosController.prototype[metodo]);

  it('no tiene @Permiso a nivel de clase', () => {
    expect(Reflect.getMetadata(PERMISO_KEY, DespachosController)).toBeUndefined();
  });

  it('findAll/findOne aceptan el permiso completo O el angosto de aprobar', () => {
    expect(permiso('findAll')).toEqual(['despachos', 'despachos-aprobar']);
    expect(permiso('findOne')).toEqual(['despachos', 'despachos-aprobar']);
  });

  it('aprobar acepta el permiso completo O el angosto', () => {
    expect(permiso('aprobar')).toEqual(['despachos', 'despachos-aprobar']);
  });

  it('los endpoints de operar exigen el módulo completo', () => {
    for (const metodo of [
      'create', 'update', 'iniciarPicking', 'marcarListo',
      'despachar', 'entregar', 'cancelar', 'asignarGuia',
    ] as const) {
      expect(permiso(metodo)).toBe('despachos');
    }
  });
});
