import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DespachosService } from './despachos.service';

const DESPACHO_BASE = {
  id: 'd1',
  empresaId: 'e1',
  numero: 'DESP-00001',
  estado: 'PEDIDO',
  almacenId: 'alm-1',
  items: [],
};

describe('DespachosService', () => {
  let prisma: any;
  let movimientosMock: any;
  let pickingMock: any;
  let service: DespachosService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    movimientosMock = { crearEnTransaccion: vi.fn().mockResolvedValue({}) };
    pickingMock = {
      generarListaEnTransaccion: vi.fn().mockResolvedValue({}),
      assertCompleta: vi.fn().mockResolvedValue(undefined),
    };
    service = new DespachosService(prisma, movimientosMock, pickingMock);
  });

  // ── findAll ────────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('devuelve todos los despachos del tenant', async () => {
      const txMock = { despacho: { findMany: vi.fn().mockResolvedValue([DESPACHO_BASE]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.findAll('e1');
      expect(r).toHaveLength(1);
    });

    it('aplica filtro de clienteId y estado', async () => {
      const txMock = { despacho: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1', { clienteId: 'cli-1', estado: 'APROBADO' });
      expect(txMock.despacho.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clienteId: 'cli-1', estado: 'APROBADO' }),
        }),
      );
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────
  describe('findOne', () => {
    it('devuelve el despacho si existe', async () => {
      const txMock = { despacho: { findFirst: vi.fn().mockResolvedValue(DESPACHO_BASE) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.findOne('e1', 'd1');
      expect(r.numero).toBe('DESP-00001');
    });

    it('lanza NotFoundException si no existe', async () => {
      const txMock = { despacho: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.findOne('e1', 'xxx')).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────
  describe('create', () => {
    it('rechaza si stock disponible < cantidad solicitada', async () => {
      // validarCliente, validarAlmacen, validarProducto, disponible()
      const txCli  = { cliente:    { findFirst: vi.fn().mockResolvedValue({ id: 'cli-1' }) } };
      const txAlm  = { almacen:    { findFirst: vi.fn().mockResolvedValue({ id: 'alm-1' }) } };
      const txProd = { producto:   { findFirst: vi.fn().mockResolvedValue({ id: 'prod-1' }) } };
      const txDisp = { inventario: { findMany: vi.fn().mockResolvedValue([{ ubicacionId: null, cantidad: 50, cantidadReservada: 40 }]) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txCli))
        .mockImplementationOnce((_e: string, fn: any) => fn(txAlm))
        .mockImplementationOnce((_e: string, fn: any) => fn(txProd))
        .mockImplementationOnce((_e: string, fn: any) => fn(txDisp));

      await expect(
        service.create('e1', {
          clienteId: 'cli-1', almacenId: 'alm-1',
          items: [{ productoId: 'prod-1', cantidad: 20, precioVenta: 10 }],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('considera el stock guardado en ubicaciones del Mapa de Almacén como disponible', async () => {
      const txCli  = { cliente:    { findFirst: vi.fn().mockResolvedValue({ id: 'cli-1' }) } };
      const txAlm  = { almacen:    { findFirst: vi.fn().mockResolvedValue({ id: 'alm-1' }) } };
      const txProd = { producto:   { findFirst: vi.fn().mockResolvedValue({ id: 'prod-1' }) } };
      const txDisp = {
        inventario: {
          findMany: vi.fn().mockResolvedValue([
            { ubicacionId: null, cantidad: 2, cantidadReservada: 0 },
            { ubicacionId: 'ubic-1', cantidad: 10, cantidadReservada: 0 },
          ]),
        },
      };
      const itemCreado = { id: 'item-1', productoId: 'prod-1', cantidad: 8, cantidadReservada: 8 };
      const despachoCreado = { ...DESPACHO_BASE, numero: 'DESP-00001', items: [itemCreado] };
      const txMain = {
        despacho:  { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue(despachoCreado) },
        inventario: { findFirst: vi.fn().mockResolvedValue({ id: 'inv-1', cantidadReservada: 0 }), update: vi.fn().mockResolvedValue({}) },
      };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txCli))
        .mockImplementationOnce((_e: string, fn: any) => fn(txAlm))
        .mockImplementationOnce((_e: string, fn: any) => fn(txProd))
        .mockImplementationOnce((_e: string, fn: any) => fn(txDisp))
        .mockImplementationOnce((_e: string, fn: any) => fn(txMain));

      await expect(
        service.create('e1', {
          clienteId: 'cli-1', almacenId: 'alm-1',
          items: [{ productoId: 'prod-1', cantidad: 8, precioVenta: 10 }],
        } as any),
      ).resolves.toBeDefined();
    });

    it('rechaza si el cliente no existe', async () => {
      const txCli = { cliente: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txCli));
      await expect(
        service.create('e1', { clienteId: 'cli-404', almacenId: 'a1', items: [] } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea el despacho y reserva stock — calcula número correlativo y totales', async () => {
      const txCli  = { cliente:    { findFirst: vi.fn().mockResolvedValue({ id: 'cli-1' }) } };
      const txAlm  = { almacen:    { findFirst: vi.fn().mockResolvedValue({ id: 'alm-1' }) } };
      const txProd = { producto:   { findFirst: vi.fn().mockResolvedValue({ id: 'prod-1' }) } };
      const txDisp = { inventario: { findMany: vi.fn().mockResolvedValue([{ ubicacionId: null, cantidad: 100, cantidadReservada: 0 }]) } };

      const itemCreado = { id: 'item-1', productoId: 'prod-1', cantidad: 5, cantidadReservada: 5 };
      const despachoCreado = { ...DESPACHO_BASE, numero: 'DESP-00001', subtotal: 500, igv: 90, total: 590, items: [itemCreado] };
      const txMain = {
        despacho:  { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue(despachoCreado) },
        inventario: { findFirst: vi.fn().mockResolvedValue({ id: 'inv-1', cantidadReservada: 0 }), update: vi.fn().mockResolvedValue({}) },
      };

      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txCli))
        .mockImplementationOnce((_e: string, fn: any) => fn(txAlm))
        .mockImplementationOnce((_e: string, fn: any) => fn(txProd))
        .mockImplementationOnce((_e: string, fn: any) => fn(txDisp))
        .mockImplementationOnce((_e: string, fn: any) => fn(txMain));

      const r = await service.create('e1', {
        clienteId: 'cli-1', almacenId: 'alm-1',
        items: [{ productoId: 'prod-1', cantidad: 5, precioVenta: 100 }],
      } as any);

      expect(txMain.despacho.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ numero: 'DESP-00001', subtotal: 500 }) }),
      );
      expect(r.total).toBe(590);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────
  describe('update', () => {
    it('rechaza si el despacho está en estado DESPACHADO/ENTREGADO/CANCELADO', async () => {
      vi.spyOn(service as any, 'findOne').mockResolvedValue({ ...DESPACHO_BASE, estado: 'DESPACHADO' });
      await expect(service.update('e1', 'd1', { observaciones: 'X' })).rejects.toThrow(ForbiddenException);
    });

    it('actualiza campos permitidos de un despacho en PEDIDO', async () => {
      vi.spyOn(service as any, 'findOne').mockResolvedValue({ ...DESPACHO_BASE, estado: 'PEDIDO' });
      const txUpdate = { despacho: { update: vi.fn().mockResolvedValue({ ...DESPACHO_BASE, observaciones: 'Urgente' }) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      const r = await service.update('e1', 'd1', { observaciones: 'Urgente' });
      expect(r.observaciones).toBe('Urgente');
    });
  });

  // ── máquina de estados ─────────────────────────────────────────────────────
  describe('transicionSimple (aprobar / iniciarPicking / marcarListo)', () => {
    it('aprobar() rechaza si el estado no es PEDIDO', async () => {
      vi.spyOn(service as any, 'findOne').mockResolvedValue({ ...DESPACHO_BASE, estado: 'APROBADO' });
      await expect(service.aprobar('e1', 'd1')).rejects.toThrow(ForbiddenException);
    });

    it('aprobar() avanza a APROBADO desde PEDIDO', async () => {
      vi.spyOn(service as any, 'findOne').mockResolvedValue({ ...DESPACHO_BASE, estado: 'PEDIDO' });
      const txUpdate = { despacho: { update: vi.fn().mockResolvedValue({ ...DESPACHO_BASE, estado: 'APROBADO' }) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      const r = await service.aprobar('e1', 'd1');
      expect(r.estado).toBe('APROBADO');
    });

    it('iniciarPicking() rechaza si el estado no es APROBADO', async () => {
      vi.spyOn(service as any, 'findOne').mockResolvedValue({ ...DESPACHO_BASE, estado: 'PEDIDO' });
      await expect(service.iniciarPicking('e1', 'd1')).rejects.toThrow(ForbiddenException);
      expect(pickingMock.generarListaEnTransaccion).not.toHaveBeenCalled();
    });

    it('iniciarPicking() genera la ListaPicking y avanza a PICKING desde APROBADO', async () => {
      const despachoAprobado = { ...DESPACHO_BASE, estado: 'APROBADO' };
      vi.spyOn(service as any, 'findOne').mockResolvedValue(despachoAprobado);
      const txUpdate = { despacho: { update: vi.fn().mockResolvedValue({ ...DESPACHO_BASE, estado: 'PICKING' }) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));

      const r = await service.iniciarPicking('e1', 'd1');

      expect(pickingMock.generarListaEnTransaccion).toHaveBeenCalledWith(txUpdate, 'e1', despachoAprobado);
      expect(r.estado).toBe('PICKING');
    });

    it('marcarListo() rechaza si el estado no es PICKING', async () => {
      vi.spyOn(service as any, 'findOne').mockResolvedValue({ ...DESPACHO_BASE, estado: 'APROBADO' });
      await expect(service.marcarListo('e1', 'd1')).rejects.toThrow(ForbiddenException);
      expect(pickingMock.assertCompleta).not.toHaveBeenCalled();
    });

    it('marcarListo() es idempotente si ya está en LISTO (auto-avance previo por picking+empaque)', async () => {
      vi.spyOn(service as any, 'findOne').mockResolvedValue({ ...DESPACHO_BASE, estado: 'LISTO' });
      const r = await service.marcarListo('e1', 'd1');
      expect(r.estado).toBe('LISTO');
      expect(pickingMock.assertCompleta).not.toHaveBeenCalled();
      expect(prisma.withTenant).not.toHaveBeenCalled();
    });

    it('marcarListo() rechaza si la ListaPicking tiene líneas sin completar', async () => {
      vi.spyOn(service as any, 'findOne').mockResolvedValue({ ...DESPACHO_BASE, estado: 'PICKING' });
      pickingMock.assertCompleta.mockRejectedValue(new ForbiddenException('incompleta'));
      await expect(service.marcarListo('e1', 'd1')).rejects.toThrow(ForbiddenException);
    });

    it('marcarListo() avanza a LISTO desde PICKING cuando el picking está completo', async () => {
      vi.spyOn(service as any, 'findOne').mockResolvedValue({ ...DESPACHO_BASE, estado: 'PICKING' });
      const txUpdate = { despacho: { update: vi.fn().mockResolvedValue({ ...DESPACHO_BASE, estado: 'LISTO' }) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));

      const r = await service.marcarListo('e1', 'd1');

      expect(pickingMock.assertCompleta).toHaveBeenCalledWith('e1', 'd1');
      expect(r.estado).toBe('LISTO');
    });
  });

  // ── despachar / despacharEnTransaccion ─────────────────────────────────────
  describe('despacharEnTransaccion', () => {
    const despachoListo = {
      id: 'd1', numero: 'DESP-00001', estado: 'LISTO', almacenId: 'alm-1', empresaId: 'e1',
      items: [{ id: 'item-1', productoId: 'prod-1', cantidad: 10, cantidadReservada: 10, costoUnitario: 5 }],
    };

    it('rechaza si el despacho no está en LISTO', async () => {
      const tx: any = { despacho: { findFirst: vi.fn().mockResolvedValue({ ...despachoListo, estado: 'PICKING' }) } };
      await expect(service.despacharEnTransaccion(tx, 'e1', 'd1', {})).rejects.toThrow(ForbiddenException);
    });

    it('lanza NotFoundException si el despacho no existe en tx', async () => {
      const tx: any = { despacho: { findFirst: vi.fn().mockResolvedValue(null) } };
      await expect(service.despacharEnTransaccion(tx, 'e1', 'd1', {})).rejects.toThrow(NotFoundException);
    });

    it('genera Movimiento SALIDA y libera la reserva', async () => {
      const tx: any = {
        despacho: {
          findFirst: vi.fn().mockResolvedValue(despachoListo),
          update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...despachoListo, ...data })),
        },
        inventario: {
          findFirst: vi.fn().mockResolvedValue({ id: 'inv-1', cantidadReservada: 10 }),
          update: vi.fn().mockResolvedValue({}),
        },
        despachoItem: { update: vi.fn().mockResolvedValue({}) },
      };
      const r = await service.despacharEnTransaccion(tx, 'e1', 'd1', { guiaNumero: 'G-001' });

      expect(movimientosMock.crearEnTransaccion).toHaveBeenCalledWith(
        tx, 'e1',
        expect.objectContaining({ tipo: 'SALIDA', productoId: 'prod-1', cantidad: 10 }),
      );
      expect(tx.despachoItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { cantidadReservada: 0 } }),
      );
      expect(r.estado).toBe('DESPACHADO');
    });
  });

  describe('despachar (wrapper de despacharEnTransaccion)', () => {
    it('delega a despacharEnTransaccion dentro de withTenant', async () => {
      const spy = vi.spyOn(service, 'despacharEnTransaccion').mockResolvedValue({ estado: 'DESPACHADO' } as any);
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn('TX'));
      await service.despachar('e1', 'd1', {});
      expect(spy).toHaveBeenCalledWith('TX', 'e1', 'd1', {});
    });
  });

  // ── entregar / entregarEnTransaccion ───────────────────────────────────────
  describe('entregarEnTransaccion', () => {
    it('rechaza si no está en DESPACHADO', async () => {
      const tx: any = { despacho: { findFirst: vi.fn().mockResolvedValue({ id: 'd1', estado: 'LISTO' }) } };
      await expect(service.entregarEnTransaccion(tx, 'e1', 'd1')).rejects.toThrow(ForbiddenException);
    });

    it('lanza NotFoundException si el despacho no existe en tx', async () => {
      const tx: any = { despacho: { findFirst: vi.fn().mockResolvedValue(null) } };
      await expect(service.entregarEnTransaccion(tx, 'e1', 'd1')).rejects.toThrow(NotFoundException);
    });

    it('avanza a ENTREGADO y registra fechaEntregado', async () => {
      const tx: any = {
        despacho: {
          findFirst: vi.fn().mockResolvedValue({ id: 'd1', estado: 'DESPACHADO' }),
          update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'd1', ...data })),
        },
      };
      const r = await service.entregarEnTransaccion(tx, 'e1', 'd1');
      expect(r.estado).toBe('ENTREGADO');
      expect(r.fechaEntregado).toBeInstanceOf(Date);
    });

    it('persiste receptorNombre, evidenciaFoto y evidenciaNotas cuando se proveen', async () => {
      const tx: any = {
        despacho: {
          findFirst: vi.fn().mockResolvedValue({ id: 'd1', estado: 'DESPACHADO' }),
          update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'd1', ...data })),
        },
      };
      const r = await service.entregarEnTransaccion(tx, 'e1', 'd1', {
        receptorNombre: 'Juan Pérez',
        evidenciaFoto: 'data:image/png;base64,xxx',
        evidenciaNotas: 'Todo en buen estado',
      });
      expect(r.receptorNombre).toBe('Juan Pérez');
      expect(r.evidenciaFoto).toBe('data:image/png;base64,xxx');
      expect(r.evidenciaNotas).toBe('Todo en buen estado');
    });
  });

  describe('entregar (wrapper de entregarEnTransaccion)', () => {
    it('delega a entregarEnTransaccion dentro de withTenant', async () => {
      const spy = vi.spyOn(service, 'entregarEnTransaccion').mockResolvedValue({ estado: 'ENTREGADO' } as any);
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn('TX'));
      await service.entregar('e1', 'd1');
      expect(spy).toHaveBeenCalledWith('TX', 'e1', 'd1', {});
    });
  });

  // ── cancelar ───────────────────────────────────────────────────────────────
  describe('cancelar', () => {
    it('rechaza si el despacho ya está DESPACHADO o ENTREGADO', async () => {
      vi.spyOn(service as any, 'findOne').mockResolvedValue({ ...DESPACHO_BASE, estado: 'DESPACHADO', items: [] });
      await expect(service.cancelar('e1', 'd1')).rejects.toThrow(ForbiddenException);
    });

    it('libera reservas de items pendientes y marca CANCELADO', async () => {
      const item = { id: 'item-1', productoId: 'prod-1', cantidadReservada: 15 };
      vi.spyOn(service as any, 'findOne').mockResolvedValue({
        ...DESPACHO_BASE, estado: 'APROBADO', almacenId: 'alm-1', items: [item],
      });
      const txMain = {
        inventario: {
          findFirst: vi.fn().mockResolvedValue({ id: 'inv-1', cantidadReservada: 15 }),
          update: vi.fn().mockResolvedValue({}),
        },
        despachoItem: { update: vi.fn().mockResolvedValue({}) },
        despacho: { update: vi.fn().mockResolvedValue({ ...DESPACHO_BASE, estado: 'CANCELADO' }) },
      };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txMain));

      const r = await service.cancelar('e1', 'd1');

      expect(txMain.inventario.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { cantidadReservada: { increment: -15 } } }),
      );
      expect(txMain.despachoItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { cantidadReservada: 0 } }),
      );
      expect(r.estado).toBe('CANCELADO');
    });
  });
});
