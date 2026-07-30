import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProformasService } from './proformas.service';

describe('ProformasService', () => {
  let prisma: any;
  let service: ProformasService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new ProformasService(prisma);
  });

  describe('findOne', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.withTenant.mockResolvedValue(null);
      await expect(service.findOne('e1', 'x')).rejects.toThrow(NotFoundException);
    });

    it('devuelve la proforma con items', async () => {
      prisma.withTenant.mockResolvedValue({ id: 'pf1', numero: 'PRO-00001', items: [] });
      expect((await service.findOne('e1', 'pf1')).numero).toBe('PRO-00001');
    });
  });

  describe('create', () => {
    const dto = {
      clienteId: 'cli1',
      items: [
        { productoId: 'prod1', descripcion: 'Laptop', cantidad: 2, precioUnitario: 1000 },
      ],
    };

    it('rechaza si el cliente no existe', async () => {
      prisma.withTenant.mockResolvedValueOnce(null); // validarCliente
      await expect(service.create('e1', dto as any)).rejects.toThrow(BadRequestException);
    });

    it('rechaza si algún producto no existe', async () => {
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'cli1' })  // validarCliente
        .mockResolvedValueOnce(null);             // validarProducto → null
      await expect(service.create('e1', dto as any)).rejects.toThrow(BadRequestException);
    });

    it('crea la proforma con subtotal, igv y total calculados', async () => {
      const txMock = {
        proforma: {
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue({ id: 'pf2', subtotal: 2000, igv: 360, total: 2360, items: [] }),
        },
      };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'cli1' })   // validarCliente
        .mockResolvedValueOnce({ id: 'prod1' })  // validarProducto
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));

      const r = await service.create('e1', dto as any);
      expect(r.igv).toBe(360);
      expect(r.total).toBe(2360);
    });

    it('genera número correlativo PRO-00001 si no hay proformas previas', async () => {
      const createMock = vi.fn().mockResolvedValue({ id: 'pf1', items: [] });
      const txMock = {
        proforma: { count: vi.fn().mockResolvedValue(0), create: createMock },
      };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'cli1' })
        .mockResolvedValueOnce({ id: 'prod1' })
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));

      await service.create('e1', dto as any);
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ numero: 'PRO-00001' }) }),
      );
    });
  });

  describe('update', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.withTenant.mockResolvedValueOnce(null);
      await expect(service.update('e1', 'x', {})).rejects.toThrow(NotFoundException);
    });

    it('lanza ForbiddenException si la proforma ya está ACEPTADA', async () => {
      prisma.withTenant.mockResolvedValueOnce({ id: 'pf1', estado: 'ACEPTADA' });
      await expect(service.update('e1', 'pf1', {})).rejects.toThrow(ForbiddenException);
    });

    it('lanza ForbiddenException si la proforma ya está RECHAZADA', async () => {
      prisma.withTenant.mockResolvedValueOnce({ id: 'pf1', estado: 'RECHAZADA' });
      await expect(service.update('e1', 'pf1', {})).rejects.toThrow(ForbiddenException);
    });

    it('actualiza notas en proforma PENDIENTE', async () => {
      const txMock = {
        proforma: { update: vi.fn().mockResolvedValue({ id: 'pf1', notas: 'Urgente', items: [] }) },
      };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'pf1', estado: 'PENDIENTE', items: [] }) // findOne
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));
      const r = await service.update('e1', 'pf1', { notas: 'Urgente' });
      expect(r.notas).toBe('Urgente');
    });
  });

  describe('remove (soft-delete → RECHAZADA)', () => {
    it('marca la proforma como RECHAZADA', async () => {
      const txMock = { proforma: { update: vi.fn().mockResolvedValue({ id: 'pf1', estado: 'RECHAZADA' }) } };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'pf1', estado: 'PENDIENTE', items: [] }) // findOne
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));
      await service.remove('e1', 'pf1');
      expect(txMock.proforma.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { estado: 'RECHAZADA' } }),
      );
    });
  });
});
