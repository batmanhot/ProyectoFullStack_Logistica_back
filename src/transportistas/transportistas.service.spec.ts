import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { TransportistasService } from './transportistas.service';

describe('TransportistasService', () => {
  let prisma: any;
  let service: TransportistasService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new TransportistasService(prisma);
  });

  describe('findAll', () => {
    it('devuelve solo activos por defecto', async () => {
      const txMock = { transportista: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1');
      expect(txMock.transportista.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ activo: true }) }),
      );
    });

    it('incluye inactivos cuando se solicita', async () => {
      const txMock = { transportista: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1', true);
      const callWhere = txMock.transportista.findMany.mock.calls[0][0].where;
      expect(callWhere).not.toHaveProperty('activo');
    });
  });

  describe('findOne', () => {
    it('lanza NotFoundException si no existe', async () => {
      const txMock = { transportista: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.findOne('e1', 'x')).rejects.toThrow(NotFoundException);
    });

    it('devuelve el transportista si existe', async () => {
      const txMock = { transportista: { findFirst: vi.fn().mockResolvedValue({ id: 't1', nombre: 'Trans SAC' }) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      expect((await service.findOne('e1', 't1')).nombre).toBe('Trans SAC');
    });
  });

  describe('create', () => {
    it('crea un transportista con los datos del DTO', async () => {
      const dto = { nombre: 'Rapidito SAC', ruc: '20111222333', placa: 'ABC-123' };
      const txMock = { transportista: { create: vi.fn().mockResolvedValue({ id: 't2', ...dto }) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.create('e1', dto as any);
      expect(r.ruc).toBe('20111222333');
    });
  });

  describe('update', () => {
    it('lanza NotFoundException si no existe', async () => {
      const txMock = { transportista: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.update('e1', 'x', {})).rejects.toThrow(NotFoundException);
    });

    it('actualiza correctamente', async () => {
      const txFindOne = { transportista: { findFirst: vi.fn().mockResolvedValue({ id: 't1' }) } };
      const txUpdate  = { transportista: { update: vi.fn().mockResolvedValue({ id: 't1', placa: 'XYZ-999' }) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txFindOne))
        .mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      const r = await service.update('e1', 't1', { placa: 'XYZ-999' } as any);
      expect(r.placa).toBe('XYZ-999');
    });
  });

  describe('remove (soft-delete)', () => {
    it('marca activo=false', async () => {
      const txFindOne = { transportista: { findFirst: vi.fn().mockResolvedValue({ id: 't1' }) } };
      const txUpdate  = { transportista: { update: vi.fn().mockResolvedValue({ id: 't1', activo: false }) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txFindOne))
        .mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      await service.remove('e1', 't1');
      expect(txUpdate.transportista.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { activo: false } }),
      );
    });
  });
});
