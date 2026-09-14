import { describe, expect, it } from 'vitest';
import { PERMISO_KEY } from '../common/decorators/permiso.decorator';
import { CotizacionesController } from './cotizaciones.controller';

/**
 * Encontrado 2026-09-12: Alertas.jsx ya asumía que Gerente de Operaciones ve
 * alertas de "RFQ sin respuesta" (esRolConCotizaciones), pero el Alcance de
 * roles (2026-09-11) le quitó 'cotizaciones' al narrar su catálogo — quedó
 * en 403 silencioso. Fix: lectura abierta, escritura gateada (mismo patrón
 * que Ordenes de Compra/Lotes/Listas de Precios).
 */
describe('CotizacionesController — permisos por endpoint', () => {
  const permiso = (metodo: keyof CotizacionesController) =>
    Reflect.getMetadata(PERMISO_KEY, CotizacionesController.prototype[metodo]);

  it('no tiene @Permiso a nivel de clase', () => {
    expect(Reflect.getMetadata(PERMISO_KEY, CotizacionesController)).toBeUndefined();
  });

  it('findAll/findOne quedan sin @Permiso (lectura abierta a cualquier rol autenticado)', () => {
    expect(permiso('findAll')).toBeUndefined();
    expect(permiso('findOne')).toBeUndefined();
  });

  it('toda escritura exige "cotizaciones"', () => {
    for (const metodo of ['create', 'update', 'remove', 'agregarRespuesta', 'marcarGanadora'] as const) {
      expect(permiso(metodo)).toBe('cotizaciones');
    }
  });
});
