import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RutasService } from './rutas.service';

describe('RutasService', () => {
  let prismaMock: any;
  let despachosMock: any;
  let service: RutasService;

  beforeEach(() => {
    prismaMock = { withTenant: vi.fn() };
    despachosMock = {
      despacharEnTransaccion: vi.fn().mockResolvedValue({}),
      entregarEnTransaccion: vi.fn().mockResolvedValue({}),
    };
    service = new RutasService(prismaMock, despachosMock);
  });

  describe('create', () => {
    it('rechaza si algún despacho no está en LISTO', async () => {
      prismaMock.withTenant
        .mockResolvedValueOnce({ id: 'transp-1' }) // validarTransportista
        .mockResolvedValueOnce([
          { id: 'd1', numero: 'DESP-00001', estado: 'LISTO' },
          { id: 'd2', numero: 'DESP-00002', estado: 'PICKING' }, // no listo
        ]); // findMany despachos

      await expect(
        service.create('e1', {
          transportistaId: 'transp-1',
          fechaSalida: '2026-06-30',
          despachoIds: ['d1', 'd2'],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza despachoIds repetidos', async () => {
      prismaMock.withTenant.mockResolvedValueOnce({ id: 'transp-1' });
      await expect(
        service.create('e1', {
          transportistaId: 'transp-1',
          fechaSalida: '2026-06-30',
          despachoIds: ['d1', 'd1'],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('iniciar', () => {
    it('despacha TODOS los despachos de la ruta en la misma transacción', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({
        id: 'r1',
        estado: 'PROGRAMADA',
        paradas: [{ despachoId: 'd1' }, { despachoId: 'd2' }],
      } as any);

      const txMock = { ruta: { update: vi.fn().mockResolvedValue({ estado: 'EN_RUTA' }) } };
      prismaMock.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      await service.iniciar('e1', 'r1');

      expect(despachosMock.despacharEnTransaccion).toHaveBeenCalledTimes(2);
      expect(despachosMock.despacharEnTransaccion).toHaveBeenCalledWith(txMock, 'e1', 'd1', {});
      expect(despachosMock.despacharEnTransaccion).toHaveBeenCalledWith(txMock, 'e1', 'd2', {});
    });

    it('rechaza iniciar una ruta que no está PROGRAMADA', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ estado: 'EN_RUTA', paradas: [] } as any);
      await expect(service.iniciar('e1', 'r1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('marcarParada', () => {
    it('al marcar ENTREGADO, tambien entrega el Despacho correspondiente', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({
        id: 'r1',
        estado: 'EN_RUTA',
        paradas: [{ id: 'p1', despachoId: 'd1', horaLlegada: null }],
      } as any);

      const rutaActualizada = { id: 'r1', numero: 'RUTA-00001', estado: 'EN_RUTA', paradas: [] };
      const txMock = {
        parada: { update: vi.fn().mockResolvedValue({}) },
        ruta: { findFirst: vi.fn().mockResolvedValue(rutaActualizada) },
      };
      prismaMock.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      const resultado = await service.marcarParada('e1', 'r1', 'd1', { estado: 'ENTREGADO' } as any);

      expect(despachosMock.entregarEnTransaccion).toHaveBeenCalledWith(txMock, 'e1', 'd1');
      expect(txMock.parada.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          data: expect.objectContaining({ estado: 'ENTREGADO' }),
        }),
      );
      // Devuelve la Ruta completa, no la Parada suelta — el frontend
      // reemplaza el detalle en pantalla con esta respuesta.
      expect(resultado).toEqual(rutaActualizada);
    });
  });

  describe('completar', () => {
    it('rechaza si quedan paradas sin resolver', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({
        estado: 'EN_RUTA',
        paradas: [{ estado: 'ENTREGADO' }, { estado: 'PENDIENTE' }],
      } as any);

      await expect(service.completar('e1', 'r1', {} as any)).rejects.toThrow(BadRequestException);
    });
  });
});
