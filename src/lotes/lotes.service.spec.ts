import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LotesService } from './lotes.service';

describe('LotesService', () => {
  let prisma: any;
  let service: LotesService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new LotesService(prisma);
  });

  describe('findOne', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.withTenant.mockResolvedValue(null);
      await expect(service.findOne('e1', 'x')).rejects.toThrow(NotFoundException);
    });

    it('devuelve el lote si existe', async () => {
      prisma.withTenant.mockResolvedValue({ id: 'l1', numero: 'LOT-001' });
      expect((await service.findOne('e1', 'l1')).numero).toBe('LOT-001');
    });
  });

  describe('create', () => {
    it('valida que el producto exista antes de crear', async () => {
      prisma.withTenant.mockResolvedValueOnce(null); // producto no existe
      await expect(service.create('e1', { productoId: 'p-404', numero: 'L1', cantidadOriginal: 10 } as any))
        .rejects.toThrow(BadRequestException);
    });

    it('crea el lote con cantidadActual = cantidadOriginal', async () => {
      const txMock = {
        loteProducto: {
          create: vi.fn().mockResolvedValue({ id: 'l2', cantidadActual: 50, cantidadOriginal: 50 }),
        },
      };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'p1' })   // validarProducto
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));

      const r = await service.create('e1', { productoId: 'p1', numero: 'LOT-002', cantidadOriginal: 50 } as any);
      expect(r.cantidadActual).toBe(50);
    });

    it('lanza BadRequestException en número de lote duplicado (P2002)', async () => {
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'p1' })    // validarProducto
        .mockRejectedValueOnce({ code: 'P2002' });
      await expect(service.create('e1', { productoId: 'p1', numero: 'DUP', cantidadOriginal: 5 } as any))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.withTenant.mockResolvedValueOnce(null);
      await expect(service.update('e1', 'x', {})).rejects.toThrow(NotFoundException);
    });

    it('actualiza fechaVencimiento y estado', async () => {
      const txMock = { loteProducto: { update: vi.fn().mockResolvedValue({ id: 'l1', estado: 'Agotado' }) } };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'l1' })
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));
      await service.update('e1', 'l1', { estado: 'Agotado' });
      expect(txMock.loteProducto.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ estado: 'Agotado' }) }),
      );
    });
  });

  describe('remove (soft-delete)', () => {
    it('marca estado=Vencido (no borra la fila)', async () => {
      const txMock = { loteProducto: { update: vi.fn().mockResolvedValue({ id: 'l1', estado: 'Vencido' }) } };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'l1' })
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));
      await service.remove('e1', 'l1');
      expect(txMock.loteProducto.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { estado: 'Vencido' } }),
      );
    });
  });
});
