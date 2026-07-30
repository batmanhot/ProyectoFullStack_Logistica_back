import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { UbicacionesService } from './ubicaciones.service';

describe('UbicacionesService — asignar/liberar', () => {
  let prisma: any;
  let service: UbicacionesService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new UbicacionesService(prisma);
    // findOne y validarProducto/validarAlmacen se ejercen en el spec principal;
    // aquí los espiamos para aislar la lógica de asignar/liberar.
    vi.spyOn(service, 'findOne').mockResolvedValue({ id: 'u1', almacenId: 'alm-1' } as any);
  });

  // ── asignar ────────────────────────────────────────────────────────────────
  describe('asignar', () => {
    it('rechaza cuando cantidad > disponible (cantidad - cantidadReservada)', async () => {
      const txProducto = { producto: { findFirst: vi.fn().mockResolvedValue({ id: 'prod-1' }) } };
      const txAsignar  = {
        inventario: {
          findFirst: vi.fn().mockResolvedValue({ id: 'inv-null', cantidad: 50, cantidadReservada: 30 }), // disponible = 20
        },
      };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txProducto))   // validarProducto
        .mockImplementationOnce((_e: string, fn: any) => fn(txAsignar));   // bloque principal

      await expect(
        service.asignar('e1', 'u1', { productoId: 'prod-1', cantidad: 25 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si el producto no existe', async () => {
      const txProducto = { producto: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txProducto));
      await expect(
        service.asignar('e1', 'u1', { productoId: 'no-existe', cantidad: 5 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea una nueva fila en la ubicación si no existía antes', async () => {
      const txProducto = { producto: { findFirst: vi.fn().mockResolvedValue({ id: 'prod-1' }) } };
      const txMock = {
        inventario: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ id: 'inv-null', cantidad: 50, cantidadReservada: 10 }) // bucket sin asignar
            .mockResolvedValueOnce(null),                                                     // incrementarOCrear: no existe → create
          update: vi.fn().mockResolvedValue({}),
          create: vi.fn().mockResolvedValue({}),
          count:  vi.fn().mockResolvedValue(1),
        },
        ubicacion: { update: vi.fn().mockResolvedValue({}) },
      };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txProducto))
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));

      const r = await service.asignar('e1', 'u1', { productoId: 'prod-1', cantidad: 20 } as any);

      expect(txMock.inventario.update).toHaveBeenCalledWith({
        where: { id: 'inv-null' },
        data: { cantidad: { decrement: 20 } },
      });
      expect(txMock.inventario.create).toHaveBeenCalledWith({
        data: { productoId: 'prod-1', almacenId: 'alm-1', ubicacionId: 'u1', cantidad: 20 },
      });
      expect(r.cantidadReubicada).toBe(20);
    });

    it('incrementa la fila existente en la ubicación si ya tenía ese producto', async () => {
      const txProducto = { producto: { findFirst: vi.fn().mockResolvedValue({ id: 'prod-1' }) } };
      const txMock = {
        inventario: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ id: 'inv-null', cantidad: 50, cantidadReservada: 0 })  // bucket
            .mockResolvedValueOnce({ id: 'inv-u1', cantidad: 5 }),                           // ya existe en ubicación
          update: vi.fn().mockResolvedValue({}),
          count:  vi.fn().mockResolvedValue(1),
        },
        ubicacion: { update: vi.fn().mockResolvedValue({}) },
      };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txProducto))
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));

      await service.asignar('e1', 'u1', { productoId: 'prod-1', cantidad: 10 } as any);

      // Debe haber dos llamadas a update: decrement del bucket + increment de la ubicación
      expect(txMock.inventario.update).toHaveBeenCalledTimes(2);
      expect(txMock.inventario.update).toHaveBeenNthCalledWith(2,
        { where: { id: 'inv-u1' }, data: { cantidad: { increment: 10 } } },
      );
    });
  });

  // ── liberar ────────────────────────────────────────────────────────────────
  describe('liberar', () => {
    it('rechaza cuando cantidad > stock en la ubicación', async () => {
      const txProducto = { producto: { findFirst: vi.fn().mockResolvedValue({ id: 'prod-1' }) } };
      const txMock = {
        inventario: { findFirst: vi.fn().mockResolvedValue({ id: 'inv-u1', cantidad: 5 }) },
      };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txProducto))
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));

      await expect(
        service.liberar('e1', 'u1', { productoId: 'prod-1', cantidad: 10 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('decrementa la fila en la ubicación y regresa stock al bucket null', async () => {
      const txProducto = { producto: { findFirst: vi.fn().mockResolvedValue({ id: 'prod-1' }) } };
      const txMock = {
        inventario: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ id: 'inv-u1', cantidad: 30 })  // stock en ubicación
            .mockResolvedValueOnce({ id: 'inv-null', cantidad: 10 }), // bucket null ya existe
          update: vi.fn().mockResolvedValue({}),
          count:  vi.fn().mockResolvedValue(0),
        },
        ubicacion: { update: vi.fn().mockResolvedValue({}) },
      };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txProducto))
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));

      const r = await service.liberar('e1', 'u1', { productoId: 'prod-1', cantidad: 15 } as any);

      expect(txMock.inventario.update).toHaveBeenNthCalledWith(1,
        { where: { id: 'inv-u1' }, data: { cantidad: { decrement: 15 } } },
      );
      expect(r.cantidadLiberada).toBe(15);
    });
  });
});
