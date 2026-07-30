import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { CategoriasService } from './categorias.service';

describe('CategoriasService', () => {
  let prisma: any;
  let service: CategoriasService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new CategoriasService(prisma);
  });

  describe('findAll', () => {
    it('devuelve solo activas por defecto', async () => {
      const txMock = { categoria: { findMany: vi.fn().mockResolvedValue([{ id: 'c1' }]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.findAll('e1');
      expect(txMock.categoria.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ estado: 'Activo' }) }),
      );
      expect(r).toHaveLength(1);
    });

    it('aplica filtro de búsqueda por nombre', async () => {
      const txMock = { categoria: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1', 'Ropa');
      expect(txMock.categoria.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ nombre: { contains: 'Ropa', mode: 'insensitive' } }),
        }),
      );
    });

    it('retorna inactivas cuando incluirInactivas=true', async () => {
      const txMock = { categoria: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1', undefined, true);
      const callWhere = txMock.categoria.findMany.mock.calls[0][0].where;
      expect(callWhere).not.toHaveProperty('estado');
    });
  });

  describe('findOne', () => {
    it('devuelve la categoría si existe', async () => {
      const txMock = { categoria: { findFirst: vi.fn().mockResolvedValue({ id: 'c1', nombre: 'Ropa' }) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.findOne('e1', 'c1');
      expect(r.id).toBe('c1');
    });

    it('lanza NotFoundException si no existe', async () => {
      const txMock = { categoria: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.findOne('e1', 'no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('crea la categoría con los campos del DTO', async () => {
      const txMock = { categoria: { create: vi.fn().mockResolvedValue({ id: 'c2', nombre: 'Alimentos' }) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.create('e1', { nombre: 'Alimentos', descripcion: '' });
      expect(r.nombre).toBe('Alimentos');
    });
  });

  describe('update', () => {
    it('lanza NotFoundException si la categoría no existe', async () => {
      const txMock = { categoria: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.update('e1', 'no-existe', { nombre: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('actualiza y devuelve la categoría modificada', async () => {
      const txFindOne = { categoria: { findFirst: vi.fn().mockResolvedValue({ id: 'c1' }) } };
      const txUpdate  = { categoria: { update: vi.fn().mockResolvedValue({ id: 'c1', nombre: 'Nuevo' }) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txFindOne))
        .mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      const r = await service.update('e1', 'c1', { nombre: 'Nuevo' });
      expect(r.nombre).toBe('Nuevo');
    });
  });

  describe('remove (soft-delete)', () => {
    it('lanza NotFoundException si no existe', async () => {
      const txMock = { categoria: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.remove('e1', 'no-existe')).rejects.toThrow(NotFoundException);
    });

    it('marca la categoría como Inactivo (no borra la fila)', async () => {
      const txFindOne = { categoria: { findFirst: vi.fn().mockResolvedValue({ id: 'c1' }) } };
      const txUpdate  = { categoria: { update: vi.fn().mockResolvedValue({ id: 'c1', estado: 'Inactivo' }) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txFindOne))
        .mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      const r = await service.remove('e1', 'c1');
      expect(txUpdate.categoria.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { estado: 'Inactivo' } }),
      );
    });
  });
});
