import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatosService } from './datos.service';

/**
 * Red de seguridad mínima para el único código del backend que borra/restaura
 * datos completos de una empresa (limpiarOperativos/restaurarDemo) — hoy sin
 * ningún test. No busca cobertura exhaustiva de sembrarDemo (~195 líneas de
 * data fija); el objetivo es detectar si alguien rompe el orden de borrado
 * por FKs o el flujo limpiar->sembrar.
 */

// Mock lazy de un `tx` de Prisma — cualquier modelo accedido recibe un
// `deleteMany` mockeado, sin tener que enumerar los ~34 modelos a mano.
function crearTxMock() {
  const modelos: Record<string, { deleteMany: ReturnType<typeof vi.fn> }> = {};
  return new Proxy(modelos, {
    get(target, prop: string) {
      if (!target[prop]) {
        target[prop] = { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) };
      }
      return target[prop];
    },
  }) as any;
}

describe('DatosService', () => {
  let prisma: any;
  let service: DatosService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new DatosService(prisma);
  });

  describe('limpiarOperativos', () => {
    it('abre la transacción con timeout de 30s (~25 deleteMany secuenciales, el default de 5s no alcanza)', async () => {
      const tx = crearTxMock();
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await service.limpiarOperativos('e1');
      expect(prisma.withTenant).toHaveBeenCalledWith('e1', expect.any(Function), { timeout: 30000 });
    });

    it('borra pagoCxC antes que cuentaPorCobrar (FK de pago hacia la cuenta)', async () => {
      const tx = crearTxMock();
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await service.limpiarOperativos('e1');
      expect(tx.pagoCxC.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
        tx.cuentaPorCobrar.deleteMany.mock.invocationCallOrder[0],
      );
    });

    it('borra despachoItem antes que despacho (FK del ítem hacia la cabecera)', async () => {
      const tx = crearTxMock();
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await service.limpiarOperativos('e1');
      expect(tx.despachoItem.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
        tx.despacho.deleteMany.mock.invocationCallOrder[0],
      );
    });

    it('borra inventarioFisicoLinea antes que inventarioFisico (FK de la línea hacia la cabecera)', async () => {
      const tx = crearTxMock();
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await service.limpiarOperativos('e1');
      expect(tx.inventarioFisicoLinea.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
        tx.inventarioFisico.deleteMany.mock.invocationCallOrder[0],
      );
    });

    it('NO toca ubicacion/areaInterna/almacen/categoria (solo limpia lo operativo)', async () => {
      const tx = crearTxMock();
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await service.limpiarOperativos('e1');
      expect(tx.ubicacion.deleteMany).not.toHaveBeenCalled();
      expect(tx.areaInterna.deleteMany).not.toHaveBeenCalled();
      expect(tx.almacen.deleteMany).not.toHaveBeenCalled();
      expect(tx.categoria.deleteMany).not.toHaveBeenCalled();
    });

    it('devuelve confirmación ok', async () => {
      const tx = crearTxMock();
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      const r = await service.limpiarOperativos('e1');
      expect(r).toEqual({ ok: true, mensaje: 'Datos operativos eliminados correctamente' });
    });
  });

  describe('restaurarDemo', () => {
    it('borra estructura de catálogos además de lo operativo, y luego siembra', async () => {
      const tx = crearTxMock();
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      const sembrarSpy = vi.spyOn(service as any, 'sembrarDemo').mockResolvedValue(undefined);

      const r = await service.restaurarDemo('e1');

      expect(tx.ubicacion.deleteMany).toHaveBeenCalled();
      expect(tx.areaInterna.deleteMany).toHaveBeenCalled();
      expect(tx.almacen.deleteMany).toHaveBeenCalled();
      expect(tx.categoria.deleteMany).toHaveBeenCalled();
      expect(sembrarSpy).toHaveBeenCalledWith('e1');
      expect(r).toEqual({ ok: true, mensaje: 'Datos demo restaurados correctamente' });
    });

    it('limpia lo operativo (borrarOperativos) ANTES de borrar los catálogos', async () => {
      const tx = crearTxMock();
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      vi.spyOn(service as any, 'sembrarDemo').mockResolvedValue(undefined);

      await service.restaurarDemo('e1');

      // producto se borra dentro de borrarOperativos (nivel 3); almacen se
      // borra después, ya en restaurarDemo — si alguien invierte el orden,
      // el borrado de almacen fallaría por FK con productos aún vivos.
      expect(tx.producto.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
        tx.almacen.deleteMany.mock.invocationCallOrder[0],
      );
    });

    it('no siembra si sembrarDemo no llegó a ejecutarse (propaga el error de borrado)', async () => {
      const tx = crearTxMock();
      tx.producto.deleteMany.mockRejectedValue(new Error('constraint violation'));
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      const sembrarSpy = vi.spyOn(service as any, 'sembrarDemo').mockResolvedValue(undefined);

      await expect(service.restaurarDemo('e1')).rejects.toThrow('constraint violation');
      expect(sembrarSpy).not.toHaveBeenCalled();
    });
  });
});
