import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductosService } from './productos.service';

describe('ProductosService', () => {
  let prisma: any;
  let service: ProductosService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new ProductosService(prisma);
  });

  // ── findAll ────────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('devuelve solo activos por defecto', async () => {
      const txMock = { producto: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1');
      expect(txMock.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ estado: 'Activo' }) }),
      );
    });

    it('aplica búsqueda por nombre (insensitive)', async () => {
      const txMock = { producto: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1', { busqueda: 'Teclado' });
      expect(txMock.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ nombre: { contains: 'Teclado', mode: 'insensitive' } }),
        }),
      );
    });

    it('aplica filtros de categoriaId y proveedorId', async () => {
      const txMock = { producto: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1', { categoriaId: 'cat-1', proveedorId: 'prov-1' });
      const callWhere = txMock.producto.findMany.mock.calls[0][0].where;
      expect(callWhere).toMatchObject({ categoriaId: 'cat-1', proveedorId: 'prov-1' });
    });

    it('incluye inactivos cuando se solicita', async () => {
      const txMock = { producto: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1', { incluirInactivos: true });
      const callWhere = txMock.producto.findMany.mock.calls[0][0].where;
      expect(callWhere).not.toHaveProperty('estado');
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────
  describe('findOne', () => {
    it('devuelve el producto si existe', async () => {
      const txMock = { producto: { findFirst: vi.fn().mockResolvedValue({ id: 'p1', nombre: 'Teclado' }) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.findOne('e1', 'p1');
      expect(r.nombre).toBe('Teclado');
    });

    it('lanza NotFoundException si no existe', async () => {
      const txMock = { producto: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.findOne('e1', 'xxx')).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────
  describe('create', () => {
    it('rechaza si stockMinimo > stockMaximo', async () => {
      await expect(
        service.create('e1', { sku: 'S1', stockMinimo: 50, stockMaximo: 10 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza si la categoría no existe en el tenant', async () => {
      const txCat = { categoria: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txCat));
      await expect(
        service.create('e1', { sku: 'S1', categoriaId: 'cat-404' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza si el proveedor no existe en el tenant', async () => {
      const txProv = { proveedor: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txProv));
      await expect(
        service.create('e1', { sku: 'S1', proveedorId: 'prov-404' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea el producto sin categoría ni proveedor', async () => {
      const creado = { id: 'p2', sku: 'SKU-001', nombre: 'Mouse', unidadMedida: 'UND' };
      const txCreate = { producto: { create: vi.fn().mockResolvedValue(creado) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txCreate));
      const r = await service.create('e1', { sku: 'SKU-001', nombre: 'Mouse', unidadMedida: 'UND', stockMinimo: 5, stockMaximo: 100 } as any);
      expect(r.sku).toBe('SKU-001');
    });

    it('crea el producto validando categoría y proveedor existentes', async () => {
      const txCat    = { categoria: { findFirst: vi.fn().mockResolvedValue({ id: 'cat-1' }) } };
      const txProv   = { proveedor: { findFirst: vi.fn().mockResolvedValue({ id: 'prov-1' }) } };
      const txCreate = { producto: { create: vi.fn().mockResolvedValue({ id: 'p3', sku: 'S2' }) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txCat))
        .mockImplementationOnce((_e: string, fn: any) => fn(txProv))
        .mockImplementationOnce((_e: string, fn: any) => fn(txCreate));
      const r = await service.create('e1', { sku: 'S2', categoriaId: 'cat-1', proveedorId: 'prov-1' } as any);
      expect(r.id).toBe('p3');
    });

    it('lanza BadRequestException en conflicto de SKU (P2002)', async () => {
      const txCreate = { producto: { create: vi.fn().mockRejectedValue({ code: 'P2002' }) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txCreate));
      await expect(service.create('e1', { sku: 'DUP' } as any)).rejects.toThrow(BadRequestException);
    });

    it('re-lanza errores desconocidos de Prisma', async () => {
      const txCreate = { producto: { create: vi.fn().mockRejectedValue(new Error('DB timeout')) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txCreate));
      await expect(service.create('e1', { sku: 'S1' } as any)).rejects.toThrow('DB timeout');
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────
  describe('update', () => {
    it('lanza NotFoundException si el producto no existe', async () => {
      const txMock = { producto: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.update('e1', 'xxx', {})).rejects.toThrow(NotFoundException);
    });

    it('rechaza si el rango de stock resultante es inválido', async () => {
      const txFindOne = { producto: { findFirst: vi.fn().mockResolvedValue({ id: 'p1', stockMinimo: 5, stockMaximo: 10 }) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txFindOne));
      await expect(service.update('e1', 'p1', { stockMinimo: 20 })).rejects.toThrow(BadRequestException);
    });

    it('actualiza los campos del DTO', async () => {
      const txFindOne = { producto: { findFirst: vi.fn().mockResolvedValue({ id: 'p1', stockMinimo: null, stockMaximo: null }) } };
      const txUpdate  = { producto: { update: vi.fn().mockResolvedValue({ id: 'p1', nombre: 'Mouse Pro' }) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txFindOne))
        .mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      const r = await service.update('e1', 'p1', { nombre: 'Mouse Pro' });
      expect(r.nombre).toBe('Mouse Pro');
    });

    it('valida categoría al actualizar si se pasa categoriaId', async () => {
      const txFindOne = { producto: { findFirst: vi.fn().mockResolvedValue({ id: 'p1', stockMinimo: null, stockMaximo: null }) } };
      const txCat     = { categoria: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txFindOne))
        .mockImplementationOnce((_e: string, fn: any) => fn(txCat));
      await expect(service.update('e1', 'p1', { categoriaId: 'cat-404' })).rejects.toThrow(BadRequestException);
    });

    it('valida proveedor al actualizar si se pasa proveedorId', async () => {
      const txFindOne = { producto: { findFirst: vi.fn().mockResolvedValue({ id: 'p1', stockMinimo: null, stockMaximo: null }) } };
      const txProv    = { proveedor: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txFindOne))
        .mockImplementationOnce((_e: string, fn: any) => fn(txProv));
      await expect(service.update('e1', 'p1', { proveedorId: 'prov-404' })).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException en conflicto de SKU en update (P2002)', async () => {
      const txFindOne = { producto: { findFirst: vi.fn().mockResolvedValue({ id: 'p1', stockMinimo: null, stockMaximo: null }) } };
      const txUpdate  = { producto: { update: vi.fn().mockRejectedValue({ code: 'P2002' }) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txFindOne))
        .mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      await expect(service.update('e1', 'p1', { nombre: 'X' })).rejects.toThrow(BadRequestException);
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────
  describe('remove (soft-delete)', () => {
    it('lanza NotFoundException si no existe', async () => {
      const txMock = { producto: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.remove('e1', 'xxx')).rejects.toThrow(NotFoundException);
    });

    it('marca estado=Inactivo sin borrar la fila', async () => {
      const txFindOne = { producto: { findFirst: vi.fn().mockResolvedValue({ id: 'p1' }) } };
      const txUpdate  = { producto: { update: vi.fn().mockResolvedValue({ id: 'p1', estado: 'Inactivo' }) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txFindOne))
        .mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      await service.remove('e1', 'p1');
      expect(txUpdate.producto.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { estado: 'Inactivo' } }),
      );
    });
  });
});
