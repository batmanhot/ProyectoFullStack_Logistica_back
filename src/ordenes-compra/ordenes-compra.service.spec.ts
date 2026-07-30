import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrdenesCompraService } from './ordenes-compra.service';

const ORDEN_BASE = {
  id: 'oc-1',
  empresaId: 'e1',
  numero: 'OC-00001',
  almacenId: 'alm-1',
  estado: 'APROBADA',
  items: [
    { id: 'item-1', productoId: 'prod-1', cantidad: 100, costoUnitario: 10, cantidadRecibida: 0 },
    { id: 'item-2', productoId: 'prod-2', cantidad: 50,  costoUnitario: 5,  cantidadRecibida: 20 },
  ],
};

describe('OrdenesCompraService', () => {
  let prisma: any;
  let movimientosMock: any;
  let service: OrdenesCompraService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    movimientosMock = { crearEnTransaccion: vi.fn().mockResolvedValue({}) };
    service = new OrdenesCompraService(prisma, movimientosMock);
  });

  // ── findAll ────────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('devuelve todas las órdenes del tenant', async () => {
      const txMock = { ordenCompra: { findMany: vi.fn().mockResolvedValue([ORDEN_BASE]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.findAll('e1');
      expect(r).toHaveLength(1);
    });

    it('aplica filtro de proveedorId y estado', async () => {
      const txMock = { ordenCompra: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1', { proveedorId: 'prov-1', estado: 'APROBADA' });
      expect(txMock.ordenCompra.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ proveedorId: 'prov-1', estado: 'APROBADA' }),
        }),
      );
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────
  describe('findOne', () => {
    it('devuelve la orden si existe', async () => {
      const txMock = { ordenCompra: { findFirst: vi.fn().mockResolvedValue(ORDEN_BASE) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.findOne('e1', 'oc-1');
      expect(r.numero).toBe('OC-00001');
    });

    it('lanza NotFoundException si no existe', async () => {
      const txMock = { ordenCompra: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.findOne('e1', 'xxx')).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────
  describe('create', () => {
    it('rechaza si el proveedor no existe en el tenant', async () => {
      const txProv = { proveedor: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txProv));
      await expect(
        service.create('e1', { proveedorId: 'prov-404', almacenId: 'a1', items: [] } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza si el almacén no existe en el tenant', async () => {
      const txProv = { proveedor: { findFirst: vi.fn().mockResolvedValue({ id: 'prov-1' }) } };
      const txAlm  = { almacen:   { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txProv))
        .mockImplementationOnce((_e: string, fn: any) => fn(txAlm));
      await expect(
        service.create('e1', { proveedorId: 'prov-1', almacenId: 'alm-404', items: [] } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea la OC con número correlativo y totales calculados (IGV 18%)', async () => {
      const txProv   = { proveedor: { findFirst: vi.fn().mockResolvedValue({ id: 'prov-1' }) } };
      const txAlm    = { almacen:   { findFirst: vi.fn().mockResolvedValue({ id: 'alm-1' }) } };
      const txProd   = { producto:  { findFirst: vi.fn().mockResolvedValue({ id: 'prod-1' }) } };
      const ocCreada = { id: 'oc-2', numero: 'OC-00001', subtotal: 1000, igv: 180, total: 1180, items: [] };
      const txMain   = {
        ordenCompra: {
          count:  vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(ocCreada),
        },
      };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txProv))
        .mockImplementationOnce((_e: string, fn: any) => fn(txAlm))
        .mockImplementationOnce((_e: string, fn: any) => fn(txProd))
        .mockImplementationOnce((_e: string, fn: any) => fn(txMain));

      const r = await service.create('e1', {
        proveedorId: 'prov-1', almacenId: 'alm-1',
        items: [{ productoId: 'prod-1', cantidad: 10, costoUnitario: 100 }],
      } as any);

      expect(txMain.ordenCompra.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ numero: 'OC-00001', subtotal: 1000, igv: 180, total: 1180 }) }),
      );
      expect(r.total).toBe(1180);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────
  describe('update', () => {
    it('rechaza si la orden ya está RECIBIDA o CANCELADA', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ ...ORDEN_BASE, estado: 'RECIBIDA' } as any);
      await expect(service.update('e1', 'oc-1', { notas: 'X' })).rejects.toThrow(ForbiddenException);
    });

    it('actualiza campos permitidos de una orden en estado APROBADA', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue(ORDEN_BASE as any);
      const txUpdate = { ordenCompra: { update: vi.fn().mockResolvedValue({ ...ORDEN_BASE, notas: 'Urgente' }) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      const r = await service.update('e1', 'oc-1', { notas: 'Urgente' });
      expect(r.notas).toBe('Urgente');
    });
  });

  // ── recibir ────────────────────────────────────────────────────────────────
  describe('recibir', () => {
    it('rechaza recibir más de lo pendiente para un ítem', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue(ORDEN_BASE as any);
      await expect(
        service.recibir('e1', 'oc-1', {
          items: [{ ordenCompraItemId: 'item-1', cantidad: 150 }],
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(movimientosMock.crearEnTransaccion).not.toHaveBeenCalled();
    });

    it('rechaza recepcionar una orden ya RECIBIDA o CANCELADA', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ ...ORDEN_BASE, estado: 'RECIBIDA' } as any);
      await expect(
        service.recibir('e1', 'oc-1', { items: [{ ordenCompraItemId: 'item-1', cantidad: 10 }] } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rechaza si el ítemId no pertenece a esta orden', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue(ORDEN_BASE as any);
      await expect(
        service.recibir('e1', 'oc-1', { items: [{ ordenCompraItemId: 'item-inexistente', cantidad: 5 }] } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('genera Movimiento ENTRADA y queda en PARCIAL si falta algo', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue(ORDEN_BASE as any);
      const txMock = {
        ordenCompraItem: {
          update:   vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([
            { id: 'item-1', cantidad: 100, cantidadRecibida: 100 },
            { id: 'item-2', cantidad: 50,  cantidadRecibida: 20 },
          ]),
        },
        ordenCompra: { update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve(data)) },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.recibir('e1', 'oc-1', {
        items: [{ ordenCompraItemId: 'item-1', cantidad: 100 }],
      } as any);
      expect(movimientosMock.crearEnTransaccion).toHaveBeenCalledWith(
        txMock, 'e1',
        expect.objectContaining({ tipo: 'ENTRADA', productoId: 'prod-1', cantidad: 100 }),
      );
      expect(r.estado).toBe('PARCIAL');
    });

    it('queda RECIBIDA cuando todos los ítems completan su cantidad', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue(ORDEN_BASE as any);
      const txMock = {
        ordenCompraItem: {
          update:   vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([
            { id: 'item-1', cantidad: 100, cantidadRecibida: 100 },
            { id: 'item-2', cantidad: 50,  cantidadRecibida: 50 },
          ]),
        },
        ordenCompra: { update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve(data)) },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.recibir('e1', 'oc-1', {
        items: [
          { ordenCompraItemId: 'item-1', cantidad: 100 },
          { ordenCompraItemId: 'item-2', cantidad: 30 },
        ],
      } as any);
      expect(r.estado).toBe('RECIBIDA');
    });
  });
});
