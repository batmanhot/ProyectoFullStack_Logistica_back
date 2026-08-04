import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PedidosInternosService } from './pedidos-internos.service';

const PEDIDO_BASE = {
  id: 'p1', empresaId: 'e1', numero: 'PI-00001',
  estado: 'BORRADOR', almacenId: 'alm-1',
  reciboConfirmado: false,
  items: [{ productoId: 'prod-1', cantidad: 5 }],
};

describe('PedidosInternosService', () => {
  let prisma: any;
  let movimientosMock: any;
  let service: PedidosInternosService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    movimientosMock = { crearEnTransaccion: vi.fn().mockResolvedValue({}) };
    service = new PedidosInternosService(prisma, movimientosMock);
  });

  // ── findAll ────────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('devuelve todos los pedidos del tenant', async () => {
      const txMock = { pedidoInterno: { findMany: vi.fn().mockResolvedValue([PEDIDO_BASE]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.findAll('e1');
      expect(r).toHaveLength(1);
    });

    it('aplica filtro de areaId y estado', async () => {
      const txMock = { pedidoInterno: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1', { areaId: 'area-1', estado: 'ENVIADO' });
      expect(txMock.pedidoInterno.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ areaId: 'area-1', estado: 'ENVIADO' }) }),
      );
    });

    it('incluye los nombres de solicitante/aprobador/entregador para el timeline de trazabilidad', async () => {
      const txMock = { pedidoInterno: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1');
      expect(txMock.pedidoInterno.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            usuarioSolicita: { select: { nombre: true } },
            usuarioAprueba: { select: { nombre: true } },
            usuarioEntrega: { select: { nombre: true } },
          }),
        }),
      );
    });
  });

  // ── productosDisponibles ───────────────────────────────────────────────────
  describe('productosDisponibles', () => {
    it('devuelve solo id/sku/nombre/unidadMedida de productos activos', async () => {
      const productos = [{ id: 'p1', sku: 'SKU-1', nombre: 'Producto 1', unidadMedida: 'UND' }];
      const txMock = { producto: { findMany: vi.fn().mockResolvedValue(productos) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      const r = await service.productosDisponibles('e1');

      expect(txMock.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { empresaId: 'e1', estado: 'Activo' },
          select: { id: true, sku: true, nombre: true, unidadMedida: true },
        }),
      );
      expect(r).toEqual(productos);
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────
  describe('findOne', () => {
    it('devuelve el pedido si existe', async () => {
      const txMock = { pedidoInterno: { findFirst: vi.fn().mockResolvedValue(PEDIDO_BASE) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.findOne('e1', 'p1');
      expect(r.numero).toBe('PI-00001');
    });

    it('lanza NotFoundException si no existe', async () => {
      const txMock = { pedidoInterno: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.findOne('e1', 'xxx')).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────
  describe('create', () => {
    it('rechaza si el área no existe en el tenant', async () => {
      const txArea = { areaInterna: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txArea));
      await expect(
        service.create('e1', 'usr-1', { areaId: 'area-404', almacenId: 'a1', items: [] } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea en BORRADOR con número correlativo PI-XXXXX', async () => {
      const txArea   = { areaInterna: { findFirst: vi.fn().mockResolvedValue({ id: 'area-1' }) } };
      const txAlm    = { almacen:     { findFirst: vi.fn().mockResolvedValue({ id: 'alm-1' }) } };
      const txProd   = { producto:    { findFirst: vi.fn().mockResolvedValue({ id: 'prod-1' }) } };
      const pedidoCreado = { ...PEDIDO_BASE, numero: 'PI-00001' };
      const txMain   = {
        pedidoInterno: {
          count:  vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(pedidoCreado),
        },
      };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txArea))
        .mockImplementationOnce((_e: string, fn: any) => fn(txAlm))
        .mockImplementationOnce((_e: string, fn: any) => fn(txProd))
        .mockImplementationOnce((_e: string, fn: any) => fn(txMain));
      const r = await service.create('e1', 'usr-1', {
        areaId: 'area-1', almacenId: 'alm-1', items: [{ productoId: 'prod-1', cantidad: 5 }],
      } as any);
      expect(txMain.pedidoInterno.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ numero: 'PI-00001' }) }),
      );
      expect(r.numero).toBe('PI-00001');
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────
  describe('update', () => {
    it('rechaza si el pedido no está en BORRADOR', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ ...PEDIDO_BASE, estado: 'ENVIADO' } as any);
      await expect(service.update('e1', 'p1', { prioridad: 'URGENTE' })).rejects.toThrow(ForbiddenException);
    });

    it('actualiza campos en BORRADOR', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue(PEDIDO_BASE as any);
      const txUpdate = { pedidoInterno: { update: vi.fn().mockResolvedValue({ ...PEDIDO_BASE, prioridad: 'URGENTE' }) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      const r = await service.update('e1', 'p1', { prioridad: 'URGENTE' });
      expect(r.prioridad).toBe('URGENTE');
    });
  });

  // ── máquina de estados ─────────────────────────────────────────────────────
  describe('transiciones de estado', () => {
    it('enviar() rechaza si no está en BORRADOR', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ ...PEDIDO_BASE, estado: 'ENVIADO' } as any);
      await expect(service.enviar('e1', 'p1')).rejects.toThrow(ForbiddenException);
    });

    it('enviar() avanza a ENVIADO desde BORRADOR y registra fechaEnvio', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue(PEDIDO_BASE as any);
      const txUpdate = { pedidoInterno: { update: vi.fn().mockResolvedValue({ ...PEDIDO_BASE, estado: 'ENVIADO' }) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      const r = await service.enviar('e1', 'p1');
      expect(r.estado).toBe('ENVIADO');
      expect(txUpdate.pedidoInterno.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ estado: 'ENVIADO', fechaEnvio: expect.any(Date) }) }),
      );
    });

    it('aprobar() rechaza si no está en ENVIADO', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue(PEDIDO_BASE as any);
      await expect(service.aprobar('e1', 'p1', 'usr-admin', {})).rejects.toThrow(ForbiddenException);
    });

    it('aprobar() avanza a APROBADO y guarda usuarioApruebaId', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ ...PEDIDO_BASE, estado: 'ENVIADO' } as any);
      const txUpdate = { pedidoInterno: { update: vi.fn().mockResolvedValue({ ...PEDIDO_BASE, estado: 'APROBADO' }) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      const r = await service.aprobar('e1', 'p1', 'usr-admin', { notas: 'OK' });
      expect(txUpdate.pedidoInterno.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ estado: 'APROBADO', usuarioApruebaId: 'usr-admin' }) }),
      );
    });

    it('rechazar() rechaza si no está en ENVIADO', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue(PEDIDO_BASE as any);
      await expect(service.rechazar('e1', 'p1', 'usr-admin', { motivo: 'X' })).rejects.toThrow(ForbiddenException);
    });

    it('rechazar() avanza a RECHAZADO con motivo', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ ...PEDIDO_BASE, estado: 'ENVIADO' } as any);
      const txUpdate = { pedidoInterno: { update: vi.fn().mockResolvedValue({ ...PEDIDO_BASE, estado: 'RECHAZADO' }) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      await service.rechazar('e1', 'p1', 'usr-admin', { motivo: 'Sin presupuesto' });
      expect(txUpdate.pedidoInterno.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            estado: 'RECHAZADO', motivoRechazo: 'Sin presupuesto', fechaRechazo: expect.any(Date),
          }),
        }),
      );
    });

    it('marcarPicking() rechaza si no está APROBADO', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ ...PEDIDO_BASE, estado: 'ENVIADO' } as any);
      await expect(service.marcarPicking('e1', 'p1')).rejects.toThrow(ForbiddenException);
    });

    it('marcarPicking() avanza a PICKING desde APROBADO y registra fechaPicking', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ ...PEDIDO_BASE, estado: 'APROBADO' } as any);
      const txUpdate = { pedidoInterno: { update: vi.fn().mockResolvedValue({ ...PEDIDO_BASE, estado: 'PICKING' }) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      const r = await service.marcarPicking('e1', 'p1');
      expect(r.estado).toBe('PICKING');
      expect(txUpdate.pedidoInterno.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ estado: 'PICKING', fechaPicking: expect.any(Date) }) }),
      );
    });
  });

  // ── entregar ───────────────────────────────────────────────────────────────
  describe('entregar', () => {
    it('rechaza si el pedido no está en PICKING', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ ...PEDIDO_BASE, estado: 'APROBADO', items: [] } as any);
      await expect(service.entregar('e1', 'p1', 'usr-1')).rejects.toThrow(ForbiddenException);
      expect(movimientosMock.crearEnTransaccion).not.toHaveBeenCalled();
    });

    it('genera un Movimiento SALIDA por cada ítem y marca ENTREGADO', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({
        ...PEDIDO_BASE, estado: 'PICKING',
        items: [{ productoId: 'prod-1', cantidad: 5 }, { productoId: 'prod-2', cantidad: 3 }],
      } as any);
      const txMock = {
        pedidoInterno: { update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...PEDIDO_BASE, ...data })) },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.entregar('e1', 'p1', 'usr-almacenero');
      expect(movimientosMock.crearEnTransaccion).toHaveBeenCalledTimes(2);
      expect(r.estado).toBe('ENTREGADO');
    });
  });

  // ── confirmarRecibo ────────────────────────────────────────────────────────
  describe('confirmarRecibo', () => {
    it('rechaza si el pedido no está ENTREGADO', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ ...PEDIDO_BASE, estado: 'PICKING', reciboConfirmado: false } as any);
      await expect(service.confirmarRecibo('e1', 'p1')).rejects.toThrow(ForbiddenException);
    });

    it('rechaza si el recibo ya estaba confirmado', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ ...PEDIDO_BASE, estado: 'ENTREGADO', reciboConfirmado: true } as any);
      await expect(service.confirmarRecibo('e1', 'p1')).rejects.toThrow(BadRequestException);
    });

    it('marca reciboConfirmado=true y registra fecha', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ ...PEDIDO_BASE, estado: 'ENTREGADO', reciboConfirmado: false } as any);
      const txUpdate = { pedidoInterno: { update: vi.fn().mockResolvedValue({ ...PEDIDO_BASE, reciboConfirmado: true }) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      await service.confirmarRecibo('e1', 'p1');
      expect(txUpdate.pedidoInterno.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reciboConfirmado: true }) }),
      );
    });
  });
});
