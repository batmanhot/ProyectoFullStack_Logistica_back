import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PickingService } from './picking.service';

describe('PickingService', () => {
  let prisma: any;
  let service: PickingService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new PickingService(prisma);
  });

  // ── generarListaEnTransaccion ────────────────────────────────────────────
  describe('generarListaEnTransaccion', () => {
    it('sugiere la ubicación de zona Picking sobre Reserva a igual producto', async () => {
      const tx: any = {
        inventario: {
          findMany: vi.fn().mockResolvedValue([
            { ubicacionId: 'ubic-reserva', cantidad: 50, ubicacion: { zona: 'Reserva' } },
            { ubicacionId: 'ubic-picking', cantidad: 10, ubicacion: { zona: 'Picking' } },
          ]),
        },
        listaPicking: {
          create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve(data)),
        },
      };
      const despacho = { id: 'd1', almacenId: 'alm-1', items: [{ productoId: 'p1', cantidad: 5 }] };

      await service.generarListaEnTransaccion(tx, 'e1', despacho);

      expect(tx.listaPicking.create).toHaveBeenCalledWith({
        data: {
          empresaId: 'e1',
          despachoId: 'd1',
          lineas: { create: [{ productoId: 'p1', ubicacionId: 'ubic-picking', cantidadRequerida: 5 }] },
        },
      });
    });

    it('a igual zona, prioriza la ubicación con mayor stock', async () => {
      const tx: any = {
        inventario: {
          findMany: vi.fn().mockResolvedValue([
            { ubicacionId: 'ubic-a', cantidad: 5, ubicacion: { zona: 'Picking' } },
            { ubicacionId: 'ubic-b', cantidad: 20, ubicacion: { zona: 'Picking' } },
          ]),
        },
        listaPicking: { create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve(data)) },
      };
      const despacho = { id: 'd1', almacenId: 'alm-1', items: [{ productoId: 'p1', cantidad: 3 }] };

      await service.generarListaEnTransaccion(tx, 'e1', despacho);

      const lineas = tx.listaPicking.create.mock.calls[0][0].data.lineas.create;
      expect(lineas[0].ubicacionId).toBe('ubic-b');
    });

    it('sugiere null (bucket sin asignar) si no hay stock en ninguna ubicación del Mapa de Almacén', async () => {
      const tx: any = {
        inventario: { findMany: vi.fn().mockResolvedValue([]) },
        listaPicking: { create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve(data)) },
      };
      const despacho = { id: 'd1', almacenId: 'alm-1', items: [{ productoId: 'p1', cantidad: 3 }] };

      await service.generarListaEnTransaccion(tx, 'e1', despacho);

      const lineas = tx.listaPicking.create.mock.calls[0][0].data.lineas.create;
      expect(lineas[0].ubicacionId).toBeNull();
    });
  });

  // ── confirmarLinea ────────────────────────────────────────────────────────
  describe('confirmarLinea', () => {
    it('lanza NotFoundException si el despacho no tiene lista de picking', async () => {
      prisma.withTenant.mockResolvedValueOnce(null);
      await expect(service.confirmarLinea('e1', 'd1', 'lin-1', { cantidad: 5 })).rejects.toThrow(NotFoundException);
    });

    it('rechaza si la lista ya está COMPLETADA', async () => {
      prisma.withTenant.mockResolvedValueOnce({ id: 'lp1', estado: 'COMPLETADA', lineas: [] });
      await expect(service.confirmarLinea('e1', 'd1', 'lin-1', { cantidad: 5 })).rejects.toThrow(ForbiddenException);
    });

    it('lanza NotFoundException si la línea no existe en esa lista', async () => {
      prisma.withTenant.mockResolvedValueOnce({ id: 'lp1', estado: 'PENDIENTE', lineas: [] });
      const tx = { lineaPicking: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(tx));

      await expect(service.confirmarLinea('e1', 'd1', 'lin-1', { cantidad: 5 })).rejects.toThrow(NotFoundException);
    });

    it('rechaza pickear más de lo requerido', async () => {
      prisma.withTenant.mockResolvedValueOnce({ id: 'lp1', estado: 'PENDIENTE', lineas: [] });
      const tx = {
        lineaPicking: { findFirst: vi.fn().mockResolvedValue({ id: 'lin-1', cantidadRequerida: 5 }) },
      };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(tx));

      await expect(service.confirmarLinea('e1', 'd1', 'lin-1', { cantidad: 8 })).rejects.toThrow(BadRequestException);
    });

    it('marca la línea COMPLETA y la lista COMPLETADA cuando es la última línea pendiente', async () => {
      prisma.withTenant.mockResolvedValueOnce({ id: 'lp1', estado: 'EN_PROCESO', fechaInicio: new Date(), lineas: [] });
      const tx = {
        lineaPicking: {
          findFirst: vi.fn().mockResolvedValue({ id: 'lin-2', cantidadRequerida: 5 }),
          update: vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([
            { id: 'lin-1', estado: 'COMPLETA' },
            { id: 'lin-2', estado: 'COMPLETA' },
          ]),
        },
        listaPicking: { update: vi.fn().mockResolvedValue({}), findFirst: vi.fn().mockResolvedValue({ id: 'lp1', estado: 'COMPLETADA' }) },
        despacho: { findFirst: vi.fn().mockResolvedValue({ estado: 'PICKING' }), update: vi.fn().mockResolvedValue({}) },
        empaque: { findFirst: vi.fn().mockResolvedValue(null) },
      };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(tx));

      const r = await service.confirmarLinea('e1', 'd1', 'lin-2', { cantidad: 5 });

      expect(tx.lineaPicking.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'lin-2' }, data: expect.objectContaining({ cantidadPickeada: 5, estado: 'COMPLETA' }) }),
      );
      expect(tx.listaPicking.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'lp1' }, data: expect.objectContaining({ estado: 'COMPLETADA' }) }),
      );
      expect(r?.estado).toBe('COMPLETADA');
      // Sin empaque registrado, no hay avance automático a LISTO.
      expect(tx.despacho.update).not.toHaveBeenCalled();
    });

    it('avanza el despacho a LISTO automáticamente si el empaque ya estaba confirmado al completar la última línea', async () => {
      prisma.withTenant.mockResolvedValueOnce({ id: 'lp1', estado: 'EN_PROCESO', fechaInicio: new Date(), lineas: [] });
      const tx = {
        lineaPicking: {
          findFirst: vi.fn().mockResolvedValue({ id: 'lin-1', cantidadRequerida: 5 }),
          update: vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([{ id: 'lin-1', estado: 'COMPLETA' }]),
        },
        listaPicking: { update: vi.fn().mockResolvedValue({}), findFirst: vi.fn().mockResolvedValue({ id: 'lp1', estado: 'COMPLETADA' }) },
        despacho: { findFirst: vi.fn().mockResolvedValue({ estado: 'PICKING' }), update: vi.fn().mockResolvedValue({}) },
        empaque: { findFirst: vi.fn().mockResolvedValue({ estado: 'CONFIRMADO' }) },
      };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(tx));

      await service.confirmarLinea('e1', 'd1', 'lin-1', { cantidad: 5 });

      expect(tx.despacho.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { estado: 'LISTO' } });
    });

    it('marca la línea PARCIAL y mantiene la lista EN_PROCESO si aún faltan líneas', async () => {
      prisma.withTenant.mockResolvedValueOnce({ id: 'lp1', estado: 'PENDIENTE', fechaInicio: null, lineas: [] });
      const tx = {
        lineaPicking: {
          findFirst: vi.fn().mockResolvedValue({ id: 'lin-1', cantidadRequerida: 10 }),
          update: vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([{ id: 'lin-1', estado: 'PARCIAL' }]),
        },
        listaPicking: { update: vi.fn().mockResolvedValue({}), findFirst: vi.fn().mockResolvedValue({ id: 'lp1', estado: 'EN_PROCESO' }) },
      };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(tx));

      await service.confirmarLinea('e1', 'd1', 'lin-1', { cantidad: 4 });

      expect(tx.lineaPicking.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ cantidadPickeada: 4, estado: 'PARCIAL' }) }),
      );
      expect(tx.listaPicking.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ estado: 'EN_PROCESO', fechaInicio: expect.any(Date) }) }),
      );
    });

    it('respeta la ubicacionId corregida por el operario', async () => {
      prisma.withTenant.mockResolvedValueOnce({ id: 'lp1', estado: 'PENDIENTE', fechaInicio: new Date(), lineas: [] });
      const tx = {
        lineaPicking: {
          findFirst: vi.fn().mockResolvedValue({ id: 'lin-1', cantidadRequerida: 5 }),
          update: vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([{ id: 'lin-1', estado: 'COMPLETA' }]),
        },
        listaPicking: { update: vi.fn().mockResolvedValue({}), findFirst: vi.fn().mockResolvedValue({}) },
        despacho: { findFirst: vi.fn().mockResolvedValue({ estado: 'PICKING' }), update: vi.fn().mockResolvedValue({}) },
        empaque: { findFirst: vi.fn().mockResolvedValue(null) },
      };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(tx));

      await service.confirmarLinea('e1', 'd1', 'lin-1', { cantidad: 5, ubicacionId: 'ubic-otra' });

      expect(tx.lineaPicking.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ubicacionId: 'ubic-otra' }) }),
      );
    });
  });

  // ── assertCompleta ───────────────────────────────────────────────────────
  describe('assertCompleta', () => {
    it('no lanza si no existe lista de picking (fail-open)', async () => {
      prisma.withTenant.mockResolvedValueOnce(null);
      await expect(service.assertCompleta('e1', 'd1')).resolves.toBeUndefined();
    });

    it('lanza ForbiddenException si hay líneas sin completar', async () => {
      prisma.withTenant.mockResolvedValueOnce({
        id: 'lp1',
        lineas: [{ estado: 'COMPLETA' }, { estado: 'PARCIAL' }],
      });
      await expect(service.assertCompleta('e1', 'd1')).rejects.toThrow(ForbiddenException);
    });

    it('no lanza si todas las líneas están COMPLETA', async () => {
      prisma.withTenant.mockResolvedValueOnce({
        id: 'lp1',
        lineas: [{ estado: 'COMPLETA' }, { estado: 'COMPLETA' }],
      });
      await expect(service.assertCompleta('e1', 'd1')).resolves.toBeUndefined();
    });
  });

  // ── asignar ──────────────────────────────────────────────────────────────
  describe('asignar', () => {
    it('rechaza si el usuario no existe en el tenant', async () => {
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'lp1' }) // validarLista -> findByDespacho
        .mockResolvedValueOnce(null); // validar usuario

      await expect(service.asignar('e1', 'd1', 'user-x')).rejects.toThrow();
    });

    it('asigna el usuario a la lista de picking', async () => {
      const tx = { listaPicking: { update: vi.fn().mockResolvedValue({ id: 'lp1', usuarioAsignadoId: 'user-1' }) } };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'lp1' })
        .mockResolvedValueOnce({ id: 'user-1' })
        .mockImplementationOnce((_e: string, fn: any) => fn(tx));

      const r = await service.asignar('e1', 'd1', 'user-1');
      expect(r.usuarioAsignadoId).toBe('user-1');
    });
  });
});
