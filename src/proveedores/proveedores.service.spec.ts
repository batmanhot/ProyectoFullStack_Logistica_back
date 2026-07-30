import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ProveedoresService } from './proveedores.service';

describe('ProveedoresService', () => {
  let prisma: any;
  let service: ProveedoresService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new ProveedoresService(prisma);
  });

  describe('findOne', () => {
    it('devuelve el proveedor si existe', async () => {
      const txMock = { proveedor: { findFirst: vi.fn().mockResolvedValue({ id: 'pv1', razonSocial: 'Importaciones XYZ' }) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      expect((await service.findOne('e1', 'pv1')).razonSocial).toBe('Importaciones XYZ');
    });

    it('lanza NotFoundException si no existe', async () => {
      const txMock = { proveedor: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.findOne('e1', 'x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('devuelve todos los proveedores activos', async () => {
      const txMock = { proveedor: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1');
      expect(txMock.proveedor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ activo: true }) }),
      );
    });

    it('aplica búsqueda por razonSocial', async () => {
      const txMock = { proveedor: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1', 'Import');
      expect(txMock.proveedor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ razonSocial: { contains: 'Import', mode: 'insensitive' } }),
        }),
      );
    });
  });

  describe('create', () => {
    it('crea proveedor con ruc y razonSocial', async () => {
      const dto = { razonSocial: 'Importaciones SAC', ruc: '20987654321' };
      const txMock = { proveedor: { create: vi.fn().mockResolvedValue({ id: 'pv2', ...dto }) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.create('e1', dto as any);
      expect(r.ruc).toBe('20987654321');
    });
  });

  describe('update', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.withTenant.mockResolvedValueOnce(null);
      await expect(service.update('e1', 'x', {})).rejects.toThrow(NotFoundException);
    });

    it('actualiza campos parciales correctamente', async () => {
      const txFindOne = { proveedor: { findFirst: vi.fn().mockResolvedValue({ id: 'pv1' }) } };
      const txUpdate  = { proveedor: { update: vi.fn().mockResolvedValue({ id: 'pv1', telefono: '999888777' }) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txFindOne))
        .mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      const r = await service.update('e1', 'pv1', { telefono: '999888777' });
      expect(r.telefono).toBe('999888777');
    });
  });

  describe('remove (soft-delete)', () => {
    it('marca activo=false', async () => {
      const txMock = { proveedor: { update: vi.fn().mockResolvedValue({ id: 'pv1', activo: false }) } };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'pv1' })
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));
      await service.remove('e1', 'pv1');
      expect(txMock.proveedor.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { activo: false } }),
      );
    });
  });
});
