import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UbicacionesService } from './ubicaciones.service';

describe('UbicacionesService', () => {
  let prisma: any;
  let service: UbicacionesService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new UbicacionesService(prisma);
  });

  // ── findAll ────────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('excluye inactivas por defecto (estado: { not: Inactiva })', async () => {
      const txMock = { ubicacion: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1');
      expect(txMock.ubicacion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ estado: { not: 'Inactiva' } }) }),
      );
    });

    it('incluye inactivas cuando se solicita', async () => {
      const txMock = { ubicacion: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1', undefined, true);
      const callWhere = txMock.ubicacion.findMany.mock.calls[0][0].where;
      expect(callWhere).not.toHaveProperty('estado');
    });

    it('aplica filtro de almacenId cuando se pasa', async () => {
      const txMock = { ubicacion: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1', 'alm-1');
      expect(txMock.ubicacion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ almacenId: 'alm-1' }) }),
      );
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────
  describe('findOne', () => {
    it('devuelve la ubicación si existe', async () => {
      const txMock = { ubicacion: { findFirst: vi.fn().mockResolvedValue({ id: 'u1', codigo: 'A01-01' }) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.findOne('e1', 'u1');
      expect(r.codigo).toBe('A01-01');
    });

    it('lanza NotFoundException si no existe', async () => {
      const txMock = { ubicacion: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.findOne('e1', 'xxx')).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────
  describe('create', () => {
    it('rechaza si el almacén no pertenece al tenant', async () => {
      const txAlmacen = { almacen: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txAlmacen));
      await expect(
        service.create('e1', { almacenId: 'a-otro', codigo: 'A01', tipo: 'Rack', zona: 'A', capacidadMax: 10 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea la ubicación con los datos del DTO', async () => {
      const txAlmacen = { almacen: { findFirst: vi.fn().mockResolvedValue({ id: 'a1' }) } };
      const creada    = { id: 'u1', codigo: 'A01-01', tipo: 'Rack', zona: 'A', capacidadMax: 50 };
      const txCreate  = { ubicacion: { create: vi.fn().mockResolvedValue(creada) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txAlmacen))
        .mockImplementationOnce((_e: string, fn: any) => fn(txCreate));
      const r = await service.create('e1', { almacenId: 'a1', codigo: 'A01-01', tipo: 'Rack', zona: 'A', capacidadMax: 50 } as any);
      expect(r.codigo).toBe('A01-01');
    });

    it('lanza BadRequestException en código duplicado (P2002)', async () => {
      const txAlmacen = { almacen: { findFirst: vi.fn().mockResolvedValue({ id: 'a1' }) } };
      const txCreate  = { ubicacion: { create: vi.fn().mockRejectedValue({ code: 'P2002' }) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txAlmacen))
        .mockImplementationOnce((_e: string, fn: any) => fn(txCreate));
      await expect(
        service.create('e1', { almacenId: 'a1', codigo: 'A01-01', tipo: 'Rack', zona: 'A', capacidadMax: 50 } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────
  describe('update', () => {
    it('lanza NotFoundException si la ubicación no existe', async () => {
      const txMock = { ubicacion: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.update('e1', 'xxx', {})).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si capacidadActual supera capacidadMax', async () => {
      const txFindOne = { ubicacion: { findFirst: vi.fn().mockResolvedValue({ id: 'u1', capacidadMax: 100, capacidadActual: 50 }) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txFindOne));
      await expect(service.update('e1', 'u1', { capacidadActual: 150 })).rejects.toThrow(BadRequestException);
    });

    it('actualiza los campos del DTO correctamente', async () => {
      const txFindOne = { ubicacion: { findFirst: vi.fn().mockResolvedValue({ id: 'u1', capacidadMax: 100, capacidadActual: 10 }) } };
      const txUpdate  = { ubicacion: { update: vi.fn().mockResolvedValue({ id: 'u1', codigo: 'B02-01' }) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txFindOne))
        .mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      const r = await service.update('e1', 'u1', { codigo: 'B02-01' });
      expect(r.codigo).toBe('B02-01');
    });

    it('lanza BadRequestException en código duplicado (P2002) al actualizar', async () => {
      const txFindOne = { ubicacion: { findFirst: vi.fn().mockResolvedValue({ id: 'u1', capacidadMax: 100, capacidadActual: 10 }) } };
      const txUpdate  = { ubicacion: { update: vi.fn().mockRejectedValue({ code: 'P2002' }) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txFindOne))
        .mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      await expect(service.update('e1', 'u1', { codigo: 'DUP' })).rejects.toThrow(BadRequestException);
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────
  describe('remove (soft-delete)', () => {
    it('lanza NotFoundException si la ubicación no existe', async () => {
      const txMock = { ubicacion: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.remove('e1', 'xxx')).rejects.toThrow(NotFoundException);
    });

    it('marca estado=Inactiva sin borrar la fila', async () => {
      const txFindOne = { ubicacion: { findFirst: vi.fn().mockResolvedValue({ id: 'u1', capacidadMax: 50, capacidadActual: 0 }) } };
      const txUpdate  = { ubicacion: { update: vi.fn().mockResolvedValue({ id: 'u1', estado: 'Inactiva' }) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txFindOne))
        .mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      const r = await service.remove('e1', 'u1');
      expect(txUpdate.ubicacion.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { estado: 'Inactiva' } });
      expect(r.estado).toBe('Inactiva');
    });
  });

  // ── inventarioDeUbicacion ─────────────────────────────────────────────────
  describe('inventarioDeUbicacion', () => {
    it('retorna líneas de inventario con producto incluido', async () => {
      const lineas = [{ id: 'i1', cantidad: 5, producto: { sku: 'SKU1', nombre: 'Prod 1', unidadMedida: 'UN' } }];
      const txFindOne = { ubicacion: { findFirst: vi.fn().mockResolvedValue({ id: 'u1' }) } };
      const txInv     = { inventario: { findMany: vi.fn().mockResolvedValue(lineas) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txFindOne))
        .mockImplementationOnce((_e: string, fn: any) => fn(txInv));
      const r = await service.inventarioDeUbicacion('e1', 'u1');
      expect(r).toHaveLength(1);
      expect(r[0].producto.sku).toBe('SKU1');
    });

    it('lanza NotFoundException si la ubicación no existe', async () => {
      const txMock = { ubicacion: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.inventarioDeUbicacion('e1', 'xxx')).rejects.toThrow(NotFoundException);
    });
  });
});
