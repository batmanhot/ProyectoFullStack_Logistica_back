import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InventarioFisicoService } from './inventario-fisico.service';

const INV_BASE = {
  id: 'inv-1', empresaId: 'e1', numero: 'INV-00001',
  estado: 'EN_CURSO', almacenId: 'alm-1',
  lineas: [],
};

describe('InventarioFisicoService', () => {
  let prisma: any;
  let movimientosMock: any;
  let service: InventarioFisicoService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    movimientosMock = { crearEnTransaccion: vi.fn().mockResolvedValue({}) };
    service = new InventarioFisicoService(prisma, movimientosMock);
  });

  // ── findAll ────────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('devuelve todos los inventarios físicos del tenant', async () => {
      const txMock = { inventarioFisico: { findMany: vi.fn().mockResolvedValue([INV_BASE]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.findAll('e1');
      expect(r).toHaveLength(1);
    });

    it('aplica filtro de almacenId y estado', async () => {
      const txMock = { inventarioFisico: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1', { almacenId: 'alm-1', estado: 'CERRADO' });
      expect(txMock.inventarioFisico.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ almacenId: 'alm-1', estado: 'CERRADO' }) }),
      );
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────
  describe('findOne', () => {
    it('devuelve el inventario físico si existe', async () => {
      const txMock = { inventarioFisico: { findFirst: vi.fn().mockResolvedValue(INV_BASE) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.findOne('e1', 'inv-1');
      expect(r.numero).toBe('INV-00001');
    });

    it('lanza NotFoundException si no existe', async () => {
      const txMock = { inventarioFisico: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.findOne('e1', 'xxx')).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────
  describe('create', () => {
    it('rechaza si el almacén no existe en el tenant', async () => {
      const txAlm = { almacen: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txAlm));
      await expect(
        service.create('e1', 'usr-1', { almacenId: 'alm-404' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza si la categoría no existe en el tenant', async () => {
      const txAlm = { almacen:   { findFirst: vi.fn().mockResolvedValue({ id: 'alm-1' }) } };
      const txCat = { categoria: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txAlm))
        .mockImplementationOnce((_e: string, fn: any) => fn(txCat));
      await expect(
        service.create('e1', 'usr-1', { almacenId: 'alm-1', categoriaId: 'cat-404' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('genera snapshot de líneas con stock del almacén y número correlativo', async () => {
      const txAlm  = { almacen: { findFirst: vi.fn().mockResolvedValue({ id: 'alm-1' }) } };
      const creado = { ...INV_BASE, numero: 'INV-00001', lineas: [{ productoId: 'prod-1', stockSistema: 10, costoUnitario: 5 }] };
      const txMain = {
        producto: { findMany: vi.fn().mockResolvedValue([{ id: 'prod-1', precioCompra: 5 }]) },
        inventario: { findFirst: vi.fn().mockResolvedValue({ cantidad: 10 }) },
        inventarioFisico: {
          count:  vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(creado),
        },
      };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txAlm))
        .mockImplementationOnce((_e: string, fn: any) => fn(txMain));
      const r = await service.create('e1', 'usr-1', { almacenId: 'alm-1' } as any);
      expect(txMain.inventarioFisico.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ numero: 'INV-00001' }) }),
      );
      expect(r.lineas).toHaveLength(1);
    });

    it('asigna stockSistema=0 para productos sin fila de Inventario en el almacén', async () => {
      const txAlm  = { almacen: { findFirst: vi.fn().mockResolvedValue({ id: 'alm-1' }) } };
      const txMain = {
        producto: { findMany: vi.fn().mockResolvedValue([{ id: 'prod-x', precioCompra: null }]) },
        inventario: { findFirst: vi.fn().mockResolvedValue(null) }, // sin fila → stockSistema=0
        inventarioFisico: {
          count:  vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue({ ...INV_BASE, lineas: [{ productoId: 'prod-x', stockSistema: 0, costoUnitario: 0 }] }),
        },
      };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txAlm))
        .mockImplementationOnce((_e: string, fn: any) => fn(txMain));
      const r = await service.create('e1', 'usr-1', { almacenId: 'alm-1' } as any);
      expect(r.lineas[0].stockSistema).toBe(0);
      expect(r.lineas[0].costoUnitario).toBe(0);
    });
  });

  // ── actualizarLinea ────────────────────────────────────────────────────────
  describe('actualizarLinea', () => {
    it('rechaza si el inventario ya está CERRADO', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ ...INV_BASE, estado: 'CERRADO', lineas: [] } as any);
      await expect(service.actualizarLinea('e1', 'inv-1', 'prod-1', { stockFisico: 10 })).rejects.toThrow(ForbiddenException);
    });

    it('lanza NotFoundException si el producto no está en este inventario', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ ...INV_BASE, lineas: [] } as any);
      await expect(service.actualizarLinea('e1', 'inv-1', 'prod-404', { stockFisico: 10 })).rejects.toThrow(NotFoundException);
    });

    it('actualiza stockFisico y recalcula diferencia', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({
        ...INV_BASE,
        lineas: [{ id: 'l1', productoId: 'prod-1', stockSistema: 100, stockFisico: null }],
      } as any);
      const txUpdate = { inventarioFisicoLinea: { update: vi.fn().mockResolvedValue({ stockFisico: 90, diferencia: -10 }) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      await service.actualizarLinea('e1', 'inv-1', 'prod-1', { stockFisico: 90 });
      expect(txUpdate.inventarioFisicoLinea.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { stockFisico: 90, diferencia: -10 } }),
      );
    });
  });

  // ── cerrar ─────────────────────────────────────────────────────────────────
  describe('cerrar', () => {
    it('rechaza cerrar un inventario ya CERRADO', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ ...INV_BASE, estado: 'CERRADO', lineas: [] } as any);
      await expect(service.cerrar('e1', 'inv-1')).rejects.toThrow(BadRequestException);
    });

    it('rechaza si quedan líneas sin contar (stockFisico === null)', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({
        ...INV_BASE,
        lineas: [{ id: 'l1', productoId: 'prod-1', stockFisico: null, diferencia: null }],
      } as any);
      await expect(service.cerrar('e1', 'inv-1')).rejects.toThrow(BadRequestException);
      expect(movimientosMock.crearEnTransaccion).not.toHaveBeenCalled();
    });

    it('genera AJUSTE incremento para sobrantes (diferencia > 0)', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({
        ...INV_BASE,
        lineas: [{ id: 'l1', productoId: 'prod-1', stockFisico: 110, diferencia: 10, costoUnitario: 5, ajustado: false }],
      } as any);
      const txMock = {
        inventarioFisicoLinea: { update: vi.fn().mockResolvedValue({}) },
        inventarioFisico: { update: vi.fn().mockResolvedValue({ estado: 'CERRADO' }) },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.cerrar('e1', 'inv-1');
      expect(movimientosMock.crearEnTransaccion).toHaveBeenCalledWith(
        txMock, 'e1',
        expect.objectContaining({ tipo: 'AJUSTE', productoId: 'prod-1', cantidad: 10, direccion: 'incremento' }),
      );
    });

    it('genera AJUSTE decremento para faltantes (diferencia < 0)', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({
        ...INV_BASE,
        lineas: [{ id: 'l1', productoId: 'prod-1', stockFisico: 90, diferencia: -10, costoUnitario: 5, ajustado: false }],
      } as any);
      const txMock = {
        inventarioFisicoLinea: { update: vi.fn().mockResolvedValue({}) },
        inventarioFisico: { update: vi.fn().mockResolvedValue({ estado: 'CERRADO' }) },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.cerrar('e1', 'inv-1');
      expect(movimientosMock.crearEnTransaccion).toHaveBeenCalledWith(
        txMock, 'e1',
        expect.objectContaining({ tipo: 'AJUSTE', productoId: 'prod-1', cantidad: 10, direccion: 'decremento' }),
      );
    });

    it('omite líneas ya ajustadas (ajustado=true) o sin diferencia (diferencia=0)', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({
        ...INV_BASE,
        lineas: [
          { id: 'l1', productoId: 'prod-1', stockFisico: 100, diferencia: 0,   costoUnitario: 5, ajustado: false },
          { id: 'l2', productoId: 'prod-2', stockFisico: 50,  diferencia: 5,   costoUnitario: 5, ajustado: true  },
        ],
      } as any);
      const txMock = {
        inventarioFisicoLinea: { update: vi.fn().mockResolvedValue({}) },
        inventarioFisico: { update: vi.fn().mockResolvedValue({ estado: 'CERRADO' }) },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.cerrar('e1', 'inv-1');
      expect(movimientosMock.crearEnTransaccion).not.toHaveBeenCalled();
    });
  });
});
