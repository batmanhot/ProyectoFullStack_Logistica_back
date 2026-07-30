import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AlmacenesService } from './almacenes.service';

describe('AlmacenesService', () => {
  let prisma: any;
  let service: AlmacenesService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new AlmacenesService(prisma);
  });

  describe('findOne', () => {
    it('devuelve el almacén si existe', async () => {
      const txMock = { almacen: { findFirst: vi.fn().mockResolvedValue({ id: 'a1', nombre: 'Central' }) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      expect((await service.findOne('e1', 'a1')).nombre).toBe('Central');
    });

    it('lanza NotFoundException si no existe', async () => {
      const txMock = { almacen: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.findOne('e1', 'x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('devuelve solo almacenes activos por defecto', async () => {
      const txMock = { almacen: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1');
      expect(txMock.almacen.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ activo: true }) }),
      );
    });

    it('retorna todos cuando incluirInactivos=true', async () => {
      const txMock = { almacen: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1', undefined, true);
      const callWhere = txMock.almacen.findMany.mock.calls[0][0].where;
      expect(callWhere).not.toHaveProperty('activo');
    });
  });

  describe('create', () => {
    it('crea almacén con el nombre del DTO', async () => {
      const txMock = { almacen: { create: vi.fn().mockResolvedValue({ id: 'a2', nombre: 'Secundario' }) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.create('e1', { nombre: 'Secundario' });
      expect(r.nombre).toBe('Secundario');
    });
  });

  describe('update', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.withTenant.mockResolvedValueOnce(null);
      await expect(service.update('e1', 'x', { nombre: 'N' })).rejects.toThrow(NotFoundException);
    });

    it('actualiza correctamente', async () => {
      const txFindOne = { almacen: { findFirst: vi.fn().mockResolvedValue({ id: 'a1' }) } };
      const txUpdate  = { almacen: { update: vi.fn().mockResolvedValue({ id: 'a1', nombre: 'Nuevo nombre' }) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txFindOne))
        .mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      const r = await service.update('e1', 'a1', { nombre: 'Nuevo nombre' });
      expect(r.nombre).toBe('Nuevo nombre');
    });
  });

  describe('remove (soft-delete)', () => {
    it('marca activo=false en lugar de borrar', async () => {
      const txMock = { almacen: { update: vi.fn().mockResolvedValue({ id: 'a1', activo: false }) } };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'a1' })
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));
      await service.remove('e1', 'a1');
      expect(txMock.almacen.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { activo: false } }),
      );
    });
  });
});
