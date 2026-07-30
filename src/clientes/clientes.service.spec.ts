import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ClientesService } from './clientes.service';

describe('ClientesService', () => {
  let prisma: any;
  let service: ClientesService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new ClientesService(prisma);
  });

  describe('findOne', () => {
    it('devuelve el cliente si existe', async () => {
      const txMock = { cliente: { findFirst: vi.fn().mockResolvedValue({ id: 'c1', razonSocial: 'Acme SAC' }) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      expect((await service.findOne('e1', 'c1')).razonSocial).toBe('Acme SAC');
    });

    it('lanza NotFoundException si no existe', async () => {
      const txMock = { cliente: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.findOne('e1', 'x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('devuelve todos los clientes activos', async () => {
      const txMock = { cliente: { findMany: vi.fn().mockResolvedValue([{ id: 'c1' }]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.findAll('e1');
      expect(txMock.cliente.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ activo: true }) }),
      );
      expect(r).toHaveLength(1);
    });

    it('aplica filtro de búsqueda por razonSocial', async () => {
      const txMock = { cliente: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1', 'Acme');
      expect(txMock.cliente.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            razonSocial: { contains: 'Acme', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('incluye inactivos cuando incluirInactivos=true', async () => {
      const txMock = { cliente: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1', undefined, true);
      const callWhere = txMock.cliente.findMany.mock.calls[0][0].where;
      expect(callWhere).not.toHaveProperty('activo');
    });
  });

  describe('create', () => {
    it('crea cliente con razonSocial y ruc', async () => {
      const dto = { razonSocial: 'Distribuciones SAC', ruc: '20123456789' };
      const txMock = { cliente: { create: vi.fn().mockResolvedValue({ id: 'c2', ...dto }) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.create('e1', dto as any);
      expect(r.razonSocial).toBe('Distribuciones SAC');
      expect(r.ruc).toBe('20123456789');
    });
  });

  describe('update', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.withTenant.mockResolvedValueOnce(null);
      await expect(service.update('e1', 'x', {})).rejects.toThrow(NotFoundException);
    });

    it('actualiza campos parciales', async () => {
      const txMockFindOne = { cliente: { findFirst: vi.fn().mockResolvedValue({ id: 'c1' }) } };
      const txMockUpdate  = { cliente: { update: vi.fn().mockResolvedValue({ id: 'c1', email: 'nuevo@test.com' }) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txMockFindOne)) // findOne
        .mockImplementationOnce((_e: string, fn: any) => fn(txMockUpdate)); // update
      const r = await service.update('e1', 'c1', { email: 'nuevo@test.com' });
      expect(r.email).toBe('nuevo@test.com');
      expect(txMockUpdate.cliente.update).toHaveBeenCalled();
    });
  });

  describe('remove (soft-delete)', () => {
    it('marca activo=false en lugar de eliminar', async () => {
      const txMock = { cliente: { update: vi.fn().mockResolvedValue({ id: 'c1', activo: false }) } };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'c1' })
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));
      await service.remove('e1', 'c1');
      expect(txMock.cliente.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { activo: false } }),
      );
    });
  });
});
