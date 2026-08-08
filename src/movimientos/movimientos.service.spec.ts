import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MovimientosService } from './movimientos.service';

function crearTxMock(overrides: Partial<Record<string, any>> = {}) {
  return {
    producto: {
      findFirst: vi.fn().mockResolvedValue({ id: 'prod-1', empresaId: 'e1' }),
      update: vi.fn().mockResolvedValue({}),
    },
    almacen: {
      findFirst: vi.fn().mockResolvedValue({ id: 'alm-1', empresaId: 'e1' }),
    },
    loteProducto: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    inventario: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    movimiento: {
      create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'mov-1', ...data })),
    },
    empresa: {
      findUnique: vi.fn().mockResolvedValue({ costeoAutomatico: false }),
    },
    capaCosto: {
      create: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

describe('MovimientosService', () => {
  let prisma: any;
  let service: MovimientosService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new MovimientosService(prisma);
  });

  // ── findAll ────────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('devuelve todos los movimientos del tenant sin filtros', async () => {
      const txMock = { movimiento: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1');
      expect(txMock.movimiento.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ empresaId: 'e1' }) }),
      );
    });

    it('aplica filtro de productoId y tipo', async () => {
      const txMock = { movimiento: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1', { productoId: 'prod-1', tipo: 'ENTRADA' as any });
      expect(txMock.movimiento.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ productoId: 'prod-1', tipo: 'ENTRADA' }),
        }),
      );
    });

    it('aplica filtro de rango de fechas (desde / hasta)', async () => {
      const txMock = { movimiento: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1', { desde: '2026-01-01', hasta: '2026-06-30' });
      const callWhere = txMock.movimiento.findMany.mock.calls[0][0].where;
      expect(callWhere).toHaveProperty('fecha');
    });

    it('aplica OR para almacenId (origen o destino en transferencias)', async () => {
      const txMock = { movimiento: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1', { almacenId: 'alm-1' });
      const callWhere = txMock.movimiento.findMany.mock.calls[0][0].where;
      expect(callWhere).toHaveProperty('OR');
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────
  describe('findOne', () => {
    it('devuelve el movimiento si existe', async () => {
      const txMock = { movimiento: { findFirst: vi.fn().mockResolvedValue({ id: 'm1', tipo: 'ENTRADA' }) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.findOne('e1', 'm1');
      expect(r.tipo).toBe('ENTRADA');
    });

    it('lanza NotFoundException si no existe', async () => {
      const txMock = { movimiento: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.findOne('e1', 'xxx')).rejects.toThrow(NotFoundException);
    });
  });

  // ── crearEnTransaccion (lógica de negocio principal) ──────────────────────
  describe('create', () => {
    it('rechaza TRANSFERENCIA si origen y destino son el mismo almacén', async () => {
      await expect(
        service.create('e1', {
          tipo: 'TRANSFERENCIA', productoId: 'prod-1', almacenId: 'alm-1', almacenDestinoId: 'alm-1', cantidad: 5,
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.withTenant).not.toHaveBeenCalled();
    });

    it('rechaza si el producto no existe en el tenant', async () => {
      const tx = crearTxMock({ producto: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() } });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await expect(
        service.create('e1', { tipo: 'ENTRADA', productoId: 'no-existe', almacenId: 'alm-1', cantidad: 5 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza si el almacén no existe en el tenant', async () => {
      const tx = crearTxMock({ almacen: { findFirst: vi.fn().mockResolvedValue(null) } });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await expect(
        service.create('e1', { tipo: 'ENTRADA', productoId: 'prod-1', almacenId: 'alm-404', cantidad: 5 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza TRANSFERENCIA si el almacén destino no existe', async () => {
      const tx = crearTxMock({
        almacen: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ id: 'alm-1' }) // origen OK
            .mockResolvedValueOnce(null),             // destino no existe
        },
      });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await expect(
        service.create('e1', {
          tipo: 'TRANSFERENCIA', productoId: 'prod-1', almacenId: 'alm-1', almacenDestinoId: 'alm-404', cantidad: 5,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza SALIDA si stock disponible es insuficiente', async () => {
      const tx = crearTxMock({
        inventario: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([{ id: 'inv-1', ubicacionId: null, cantidad: 3, cantidadReservada: 0 }]),
          create: vi.fn(),
          update: vi.fn(),
        },
      });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await expect(
        service.create('e1', { tipo: 'SALIDA', productoId: 'prod-1', almacenId: 'alm-1', cantidad: 10 } as any),
      ).rejects.toThrow(BadRequestException);
      expect(tx.movimiento.create).not.toHaveBeenCalled();
    });

    it('rechaza SALIDA si el lote no tiene suficiente stock', async () => {
      const tx = crearTxMock({
        loteProducto: {
          findFirst: vi.fn().mockResolvedValue({ id: 'lote-1', numero: 'L001', cantidadActual: 3 }),
          update: vi.fn(),
        },
        inventario: { findFirst: vi.fn().mockResolvedValue({ id: 'inv-1', cantidad: 100 }), create: vi.fn(), update: vi.fn() },
      });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await expect(
        service.create('e1', { tipo: 'SALIDA', productoId: 'prod-1', almacenId: 'alm-1', loteId: 'lote-1', cantidad: 10 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza si el lote no existe o no pertenece al producto', async () => {
      const tx = crearTxMock({
        loteProducto: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
      });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await expect(
        service.create('e1', { tipo: 'ENTRADA', productoId: 'prod-1', almacenId: 'alm-1', loteId: 'lote-404', cantidad: 5 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('permite SALIDA con stock suficiente y descuenta el inventario', async () => {
      const tx = crearTxMock({
        inventario: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([{ id: 'inv-1', ubicacionId: null, cantidad: 20, cantidadReservada: 0 }]),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue({}),
        },
      });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await service.create('e1', { tipo: 'SALIDA', productoId: 'prod-1', almacenId: 'alm-1', cantidad: 8 } as any);
      expect(tx.inventario.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { cantidad: { decrement: 8 } },
      });
    });

    it('SALIDA descuenta primero del bucket sin asignar y luego de ubicaciones específicas cuando falta stock', async () => {
      const tx = crearTxMock({
        inventario: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([
            { id: 'inv-null', ubicacionId: null, cantidad: 5, cantidadReservada: 0 },
            { id: 'inv-ubic-1', ubicacionId: 'ubic-1', cantidad: 10, cantidadReservada: 0 },
          ]),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue({}),
        },
      });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await service.create('e1', { tipo: 'SALIDA', productoId: 'prod-1', almacenId: 'alm-1', cantidad: 8 } as any);
      expect(tx.inventario.update).toHaveBeenCalledWith({
        where: { id: 'inv-null' },
        data: { cantidad: { decrement: 5 } },
      });
      expect(tx.inventario.update).toHaveBeenCalledWith({
        where: { id: 'inv-ubic-1' },
        data: { cantidad: { decrement: 3 } },
      });
    });

    it('rechaza SALIDA si el stock TOTAL (bucket + ubicaciones) sigue siendo insuficiente', async () => {
      const tx = crearTxMock({
        inventario: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([
            { id: 'inv-null', ubicacionId: null, cantidad: 2, cantidadReservada: 0 },
            { id: 'inv-ubic-1', ubicacionId: 'ubic-1', cantidad: 3, cantidadReservada: 0 },
          ]),
          create: vi.fn(),
          update: vi.fn(),
        },
      });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await expect(
        service.create('e1', { tipo: 'SALIDA', productoId: 'prod-1', almacenId: 'alm-1', cantidad: 10 } as any),
      ).rejects.toThrow(BadRequestException);
      expect(tx.inventario.update).not.toHaveBeenCalled();
    });

    it('respeta cantidadReservada del bucket sin asignar al calcular disponible', async () => {
      const tx = crearTxMock({
        inventario: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([
            { id: 'inv-null', ubicacionId: null, cantidad: 20, cantidadReservada: 15 },
          ]),
          create: vi.fn(),
          update: vi.fn(),
        },
      });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await expect(
        service.create('e1', { tipo: 'SALIDA', productoId: 'prod-1', almacenId: 'alm-1', cantidad: 8 } as any),
      ).rejects.toThrow(BadRequestException);
      expect(tx.inventario.update).not.toHaveBeenCalled();
    });

    it('ENTRADA sin inventario previo crea la fila (no usa update)', async () => {
      const tx = crearTxMock();  // inventario.findFirst devuelve null
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await service.create('e1', { tipo: 'ENTRADA', productoId: 'prod-1', almacenId: 'alm-1', cantidad: 10 } as any);
      expect(tx.inventario.create).toHaveBeenCalled();
    });

    it('AJUSTE decremento guarda Movimiento.cantidad NEGATIVA', async () => {
      const tx = crearTxMock({
        inventario: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([{ id: 'inv-1', ubicacionId: null, cantidad: 50, cantidadReservada: 0 }]),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue({}),
        },
      });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      const r = await service.create('e1', {
        tipo: 'AJUSTE', productoId: 'prod-1', almacenId: 'alm-1', cantidad: 6, direccion: 'decremento',
      } as any);
      expect(r.cantidad).toBe(-6);
    });

    it('TRANSFERENCIA aplica delta en ambos almacenes y deja stockActual neto cero', async () => {
      const tx = crearTxMock({
        almacen: { findFirst: vi.fn().mockResolvedValue({ id: 'alm', empresaId: 'e1' }) },
        inventario: {
          findFirst: vi.fn().mockResolvedValue({ id: 'inv-1', cantidad: 20 }),
          findMany: vi.fn().mockResolvedValue([{ id: 'inv-1', ubicacionId: null, cantidad: 20, cantidadReservada: 0 }]),
          create: vi.fn().mockResolvedValue({}),
          update: vi.fn().mockResolvedValue({}),
        },
      });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await service.create('e1', {
        tipo: 'TRANSFERENCIA', productoId: 'prod-1', almacenId: 'alm-1', almacenDestinoId: 'alm-2', cantidad: 5,
      } as any);
      expect(tx.producto.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { stockActual: { increment: 0 } },
      });
    });

    it('actualiza el lote cuando se asocia un loteId en SALIDA', async () => {
      const tx = crearTxMock({
        loteProducto: {
          findFirst: vi.fn().mockResolvedValue({ id: 'lote-1', numero: 'L001', cantidadActual: 50 }),
          update: vi.fn().mockResolvedValue({}),
        },
        inventario: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([{ id: 'inv-1', ubicacionId: null, cantidad: 100, cantidadReservada: 0 }]),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue({}),
        },
      });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await service.create('e1', {
        tipo: 'SALIDA', productoId: 'prod-1', almacenId: 'alm-1', loteId: 'lote-1', cantidad: 10,
      } as any);
      expect(tx.loteProducto.update).toHaveBeenCalledWith({
        where: { id: 'lote-1' },
        data: { cantidadActual: { increment: -10 } },
      });
    });
  });

  // ── capas de costo (Fase 2, motor de valorización) ──────────────────────────
  describe('capas de costo', () => {
    it('NO crea CapaCosto en ENTRADA cuando costeoAutomatico=false (default de todo tenant hoy)', async () => {
      const tx = crearTxMock();
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await service.create('e1', {
        tipo: 'ENTRADA', productoId: 'prod-1', almacenId: 'alm-1', cantidad: 10, costoUnitario: 25,
      } as any);
      expect(tx.capaCosto.create).not.toHaveBeenCalled();
    });

    it('crea CapaCosto en ENTRADA cuando costeoAutomatico=true y viene costoUnitario', async () => {
      const tx = crearTxMock({ empresa: { findUnique: vi.fn().mockResolvedValue({ costeoAutomatico: true }) } });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await service.create('e1', {
        tipo: 'ENTRADA', productoId: 'prod-1', almacenId: 'alm-1', cantidad: 10, costoUnitario: 25,
      } as any);
      expect(tx.capaCosto.create).toHaveBeenCalledWith({
        data: {
          empresaId: 'e1',
          productoId: 'prod-1',
          loteId: null,
          movimientoEntradaId: 'mov-1',
          cantidadOriginal: 10,
          cantidadDisponible: 10,
          costoUnitario: 25,
        },
      });
    });

    it('crea CapaCosto en DEVOLUCION (de cliente) cuando costeoAutomatico=true', async () => {
      const tx = crearTxMock({ empresa: { findUnique: vi.fn().mockResolvedValue({ costeoAutomatico: true }) } });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await service.create('e1', {
        tipo: 'DEVOLUCION', productoId: 'prod-1', almacenId: 'alm-1', cantidad: 3, costoUnitario: 40,
      } as any);
      expect(tx.capaCosto.create).toHaveBeenCalled();
    });

    it('crea CapaCosto en AJUSTE con dirección incremento cuando costeoAutomatico=true', async () => {
      const tx = crearTxMock({ empresa: { findUnique: vi.fn().mockResolvedValue({ costeoAutomatico: true }) } });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await service.create('e1', {
        tipo: 'AJUSTE', productoId: 'prod-1', almacenId: 'alm-1', cantidad: 4, direccion: 'incremento', costoUnitario: 15,
      } as any);
      expect(tx.capaCosto.create).toHaveBeenCalled();
    });

    it('NO crea CapaCosto en ENTRADA con costeoAutomatico=true si no viene costoUnitario', async () => {
      const tx = crearTxMock({ empresa: { findUnique: vi.fn().mockResolvedValue({ costeoAutomatico: true }) } });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await service.create('e1', {
        tipo: 'ENTRADA', productoId: 'prod-1', almacenId: 'alm-1', cantidad: 10,
      } as any);
      expect(tx.capaCosto.create).not.toHaveBeenCalled();
    });

    it('NO crea CapaCosto en SALIDA aunque costeoAutomatico=true (Fase 3, todavía no implementada)', async () => {
      const tx = crearTxMock({
        empresa: { findUnique: vi.fn().mockResolvedValue({ costeoAutomatico: true }) },
        inventario: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([{ id: 'inv-1', ubicacionId: null, cantidad: 50, cantidadReservada: 0 }]),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue({}),
        },
      });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await service.create('e1', {
        tipo: 'SALIDA', productoId: 'prod-1', almacenId: 'alm-1', cantidad: 5, costoUnitario: 25,
      } as any);
      expect(tx.capaCosto.create).not.toHaveBeenCalled();
    });

    it('NO crea CapaCosto en AJUSTE decremento aunque costeoAutomatico=true', async () => {
      const tx = crearTxMock({
        empresa: { findUnique: vi.fn().mockResolvedValue({ costeoAutomatico: true }) },
        inventario: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([{ id: 'inv-1', ubicacionId: null, cantidad: 50, cantidadReservada: 0 }]),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue({}),
        },
      });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await service.create('e1', {
        tipo: 'AJUSTE', productoId: 'prod-1', almacenId: 'alm-1', cantidad: 6, direccion: 'decremento', costoUnitario: 25,
      } as any);
      expect(tx.capaCosto.create).not.toHaveBeenCalled();
    });

    it('NO crea CapaCosto en TRANSFERENCIA aunque costeoAutomatico=true (deltaTotal=0)', async () => {
      const tx = crearTxMock({
        empresa: { findUnique: vi.fn().mockResolvedValue({ costeoAutomatico: true }) },
        almacen: { findFirst: vi.fn().mockResolvedValue({ id: 'alm', empresaId: 'e1' }) },
        inventario: {
          findFirst: vi.fn().mockResolvedValue({ id: 'inv-1', cantidad: 20 }),
          findMany: vi.fn().mockResolvedValue([{ id: 'inv-1', ubicacionId: null, cantidad: 20, cantidadReservada: 0 }]),
          create: vi.fn().mockResolvedValue({}),
          update: vi.fn().mockResolvedValue({}),
        },
      });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await service.create('e1', {
        tipo: 'TRANSFERENCIA', productoId: 'prod-1', almacenId: 'alm-1', almacenDestinoId: 'alm-2', cantidad: 5,
      } as any);
      expect(tx.capaCosto.create).not.toHaveBeenCalled();
    });
  });

  // ── kardex ─────────────────────────────────────────────────────────────────
  describe('kardex', () => {
    it('calcula saldo acumulado corrido por movimiento', async () => {
      const movimientos = [
        { id: 'm1', tipo: 'ENTRADA',    cantidad: 100, almacenId: 'alm-1', almacenDestinoId: null },
        { id: 'm2', tipo: 'SALIDA',     cantidad: 30,  almacenId: 'alm-1', almacenDestinoId: null },
        { id: 'm3', tipo: 'AJUSTE',     cantidad: -5,  almacenId: 'alm-1', almacenDestinoId: null },
      ];
      const txMock = { movimiento: { findMany: vi.fn().mockResolvedValue(movimientos) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.kardex('e1', 'prod-1');
      expect(r).toHaveLength(3);
      // Saldo sin almacenId: delta total (no por almacén)
      expect(r[0].saldoAcumulado).toBeGreaterThan(0);
    });

    it('filtra por almacenId en OR (origen o destino)', async () => {
      const txMock = { movimiento: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.kardex('e1', 'prod-1', 'alm-1');
      const callWhere = txMock.movimiento.findMany.mock.calls[0][0].where;
      expect(callWhere).toHaveProperty('OR');
    });

    it('filtra por rango de fechas cuando se pasa desde/hasta', async () => {
      const txMock = { movimiento: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.kardex('e1', 'prod-1', undefined, '2026-01-01', '2026-06-30');
      const callWhere = txMock.movimiento.findMany.mock.calls[0][0].where;
      expect(callWhere).toHaveProperty('fecha');
    });
  });
});
