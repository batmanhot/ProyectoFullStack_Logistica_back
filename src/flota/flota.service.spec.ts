import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FlotaService } from './flota.service';

const VEHICULO_BASE = {
  id: 'v1', empresaId: 'e1', nombre: 'Camión Norte',
  placa: 'ABC-123', tipo: 'Camión', activo: true,
  kmActual: 5000,
  vencSoat: null, vencRevTecnica: null, proxMantenimiento: null,
};

describe('FlotaService', () => {
  let prisma: any;
  let service: FlotaService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new FlotaService(prisma);
  });

  // ── findAllVehiculos ───────────────────────────────────────────────────────
  describe('findAllVehiculos', () => {
    it('devuelve solo activos por defecto', async () => {
      const txMock = { vehiculoFlota: { findMany: vi.fn().mockResolvedValue([VEHICULO_BASE]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAllVehiculos('e1');
      expect(txMock.vehiculoFlota.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ activo: true }) }),
      );
    });

    it('incluye inactivos cuando se solicita', async () => {
      const txMock = { vehiculoFlota: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAllVehiculos('e1', true);
      const callWhere = txMock.vehiculoFlota.findMany.mock.calls[0][0].where;
      expect(callWhere).not.toHaveProperty('activo');
    });
  });

  // ── findOneVehiculo ────────────────────────────────────────────────────────
  describe('findOneVehiculo', () => {
    it('devuelve el vehículo si existe', async () => {
      const txMock = { vehiculoFlota: { findFirst: vi.fn().mockResolvedValue(VEHICULO_BASE) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.findOneVehiculo('e1', 'v1');
      expect(r.placa).toBe('ABC-123');
    });

    it('lanza NotFoundException si no existe', async () => {
      const txMock = { vehiculoFlota: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.findOneVehiculo('e1', 'xxx')).rejects.toThrow(NotFoundException);
    });
  });

  // ── createVehiculo ─────────────────────────────────────────────────────────
  describe('createVehiculo', () => {
    it('crea el vehículo con placa en mayúsculas', async () => {
      const txCreate = { vehiculoFlota: { create: vi.fn().mockResolvedValue({ ...VEHICULO_BASE, placa: 'ABC-123' }) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txCreate));
      const r = await service.createVehiculo('e1', {
        nombre: 'Camión Norte', tipo: 'Camión', placa: 'abc-123', anio: 2020,
      } as any);
      expect(txCreate.vehiculoFlota.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ placa: 'ABC-123' }) }),
      );
    });

    it('valida que el transportista exista si se provee', async () => {
      const txTrans = { transportista: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txTrans));
      await expect(
        service.createVehiculo('e1', { nombre: 'X', tipo: 'Y', placa: 'Z', anio: 2020, transportistaId: 'trans-404' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException en placa duplicada (P2002)', async () => {
      const txCreate = { vehiculoFlota: { create: vi.fn().mockRejectedValue({ code: 'P2002' }) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txCreate));
      await expect(
        service.createVehiculo('e1', { nombre: 'X', tipo: 'Y', placa: 'ABC-123', anio: 2020 } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── updateVehiculo ─────────────────────────────────────────────────────────
  describe('updateVehiculo', () => {
    it('lanza NotFoundException si el vehículo no existe', async () => {
      const txMock = { vehiculoFlota: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.updateVehiculo('e1', 'xxx', { nombre: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('actualiza los campos y convierte placa a mayúsculas', async () => {
      const txFindOne = { vehiculoFlota: { findFirst: vi.fn().mockResolvedValue(VEHICULO_BASE) } };
      const txUpdate  = { vehiculoFlota: { update: vi.fn().mockResolvedValue({ ...VEHICULO_BASE, placa: 'XYZ-999' }) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txFindOne))
        .mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      const r = await service.updateVehiculo('e1', 'v1', { placa: 'xyz-999' });
      expect(txUpdate.vehiculoFlota.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ placa: 'XYZ-999' }) }),
      );
    });

    it('lanza BadRequestException en placa duplicada (P2002) al actualizar', async () => {
      const txFindOne = { vehiculoFlota: { findFirst: vi.fn().mockResolvedValue(VEHICULO_BASE) } };
      const txUpdate  = { vehiculoFlota: { update: vi.fn().mockRejectedValue({ code: 'P2002' }) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txFindOne))
        .mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      await expect(service.updateVehiculo('e1', 'v1', { placa: 'DUP-000' })).rejects.toThrow(BadRequestException);
    });
  });

  // ── removeVehiculo ─────────────────────────────────────────────────────────
  describe('removeVehiculo (soft-delete)', () => {
    it('marca activo=false sin borrar la fila', async () => {
      const txFindOne = { vehiculoFlota: { findFirst: vi.fn().mockResolvedValue(VEHICULO_BASE) } };
      const txUpdate  = { vehiculoFlota: { update: vi.fn().mockResolvedValue({ ...VEHICULO_BASE, activo: false }) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txFindOne))
        .mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      await service.removeVehiculo('e1', 'v1');
      expect(txUpdate.vehiculoFlota.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { activo: false } }),
      );
    });
  });

  // ── findMantenimientos ────────────────────────────────────────────────────
  describe('findMantenimientos', () => {
    it('devuelve todos los mantenimientos del tenant', async () => {
      const txMock = { mantenimientoVehiculo: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findMantenimientos('e1');
      expect(txMock.mantenimientoVehiculo.findMany).toHaveBeenCalled();
    });

    it('aplica filtro de vehiculoId y rango de fechas', async () => {
      const txMock = { mantenimientoVehiculo: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findMantenimientos('e1', { vehiculoId: 'v1', desde: '2026-01-01', hasta: '2026-06-30' });
      const callWhere = txMock.mantenimientoVehiculo.findMany.mock.calls[0][0].where;
      expect(callWhere).toMatchObject({ vehiculoId: 'v1' });
      expect(callWhere).toHaveProperty('fecha');
    });
  });

  // ── registrarMantenimiento ────────────────────────────────────────────────
  describe('registrarMantenimiento', () => {
    it('rechaza si el km reportado es menor al km actual', async () => {
      vi.spyOn(service, 'findOneVehiculo').mockResolvedValue({ ...VEHICULO_BASE, kmActual: 5000 } as any);
      await expect(
        service.registrarMantenimiento('e1', 'v1', 'usr-1', { tipo: 'Cambio aceite', kmActual: 4000 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('registra mantenimiento y sincroniza kmActual del vehículo', async () => {
      vi.spyOn(service, 'findOneVehiculo').mockResolvedValue({ ...VEHICULO_BASE, kmActual: 5000 } as any);
      const txMock = {
        mantenimientoVehiculo: { create: vi.fn().mockResolvedValue({ id: 'm1' }) },
        vehiculoFlota: { update: vi.fn().mockResolvedValue({}) },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.registrarMantenimiento('e1', 'v1', 'usr-1', { tipo: 'Cambio aceite', kmActual: 5500 } as any);
      expect(txMock.vehiculoFlota.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { kmActual: 5500 } }),
      );
    });

    it('NO actualiza kmActual si el mantenimiento no reporta km', async () => {
      vi.spyOn(service, 'findOneVehiculo').mockResolvedValue({ ...VEHICULO_BASE, kmActual: 5000 } as any);
      const txMock = {
        mantenimientoVehiculo: { create: vi.fn().mockResolvedValue({ id: 'm1' }) },
        vehiculoFlota: { update: vi.fn().mockResolvedValue({}) },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.registrarMantenimiento('e1', 'v1', 'usr-1', { tipo: 'Revisión' } as any);
      expect(txMock.vehiculoFlota.update).not.toHaveBeenCalled();
    });
  });

  // ── updateMantenimiento / removeMantenimiento ────────────────────────────
  describe('updateMantenimiento', () => {
    it('lanza NotFoundException si el mantenimiento no existe o no pertenece al tenant', async () => {
      const txMock = { mantenimientoVehiculo: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.updateMantenimiento('e1', 'xxx', { tipo: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('actualiza solo los campos provistos', async () => {
      const txFindOne = { mantenimientoVehiculo: { findFirst: vi.fn().mockResolvedValue({ id: 'm1' }) } };
      const txUpdate  = { mantenimientoVehiculo: { update: vi.fn().mockResolvedValue({ id: 'm1', tipo: 'Afinamiento' }) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txFindOne))
        .mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      await service.updateMantenimiento('e1', 'm1', { tipo: 'Afinamiento' });
      expect(txUpdate.mantenimientoVehiculo.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { tipo: 'Afinamiento' },
      });
    });
  });

  describe('removeMantenimiento', () => {
    it('lanza NotFoundException si el mantenimiento no existe o no pertenece al tenant', async () => {
      const txMock = { mantenimientoVehiculo: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.removeMantenimiento('e1', 'xxx')).rejects.toThrow(NotFoundException);
    });

    it('elimina el mantenimiento', async () => {
      const txFindOne = { mantenimientoVehiculo: { findFirst: vi.fn().mockResolvedValue({ id: 'm1' }) } };
      const txDelete  = { mantenimientoVehiculo: { delete: vi.fn().mockResolvedValue({ id: 'm1' }) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txFindOne))
        .mockImplementationOnce((_e: string, fn: any) => fn(txDelete));
      await service.removeMantenimiento('e1', 'm1');
      expect(txDelete.mantenimientoVehiculo.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    });
  });

  // ── findCombustible ────────────────────────────────────────────────────────
  describe('findCombustible', () => {
    it('devuelve todos los registros de combustible', async () => {
      const txMock = { registroCombustible: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findCombustible('e1');
      expect(txMock.registroCombustible.findMany).toHaveBeenCalled();
    });
  });

  // ── registrarCombustible ──────────────────────────────────────────────────
  describe('registrarCombustible', () => {
    it('rechaza si kmDespues < kmAntes', async () => {
      vi.spyOn(service, 'findOneVehiculo').mockResolvedValue(VEHICULO_BASE as any);
      await expect(
        service.registrarCombustible('e1', {
          vehiculoId: 'v1', litros: 50, costo: 250, kmAntes: 5000, kmDespues: 4900,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('calcula kmRecorridos y sincroniza kmActual', async () => {
      vi.spyOn(service, 'findOneVehiculo').mockResolvedValue(VEHICULO_BASE as any);
      const txMock = {
        registroCombustible: { create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve(data)) },
        vehiculoFlota: { update: vi.fn().mockResolvedValue({}) },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.registrarCombustible('e1', {
        vehiculoId: 'v1', litros: 50, costo: 250, kmAntes: 5000, kmDespues: 5300,
      } as any);
      expect(r.kmRecorridos).toBe(300);
      expect(txMock.vehiculoFlota.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { kmActual: 5300 } }),
      );
    });

    it('NO actualiza kmActual si no hay kmDespues', async () => {
      vi.spyOn(service, 'findOneVehiculo').mockResolvedValue(VEHICULO_BASE as any);
      const txMock = {
        registroCombustible: { create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve(data)) },
        vehiculoFlota: { update: vi.fn() },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.registrarCombustible('e1', { vehiculoId: 'v1', litros: 30, costo: 150 } as any);
      expect(txMock.vehiculoFlota.update).not.toHaveBeenCalled();
    });
  });

  // ── alertas ────────────────────────────────────────────────────────────────
  describe('alertas', () => {
    it('incluye vehículo con SOAT por vencer en menos de 60 días', async () => {
      const en30Dias = new Date(Date.now() + 30 * 86400000);
      vi.spyOn(service, 'findAllVehiculos').mockResolvedValue([
        { ...VEHICULO_BASE, vencSoat: en30Dias },
      ] as any);
      const alertas = await service.alertas('e1');
      expect(alertas).toHaveLength(1);
      expect(alertas[0].tipo).toBe('SOAT');
    });

    it('NO incluye vehículo con vencimientos lejanos (> 60 días)', async () => {
      const en200Dias = new Date(Date.now() + 200 * 86400000);
      vi.spyOn(service, 'findAllVehiculos').mockResolvedValue([
        { ...VEHICULO_BASE, vencSoat: en200Dias },
      ] as any);
      const alertas = await service.alertas('e1');
      expect(alertas).toHaveLength(0);
    });

    it('genera alertas de Revisión Técnica y Mantenimiento también', async () => {
      const en10Dias = new Date(Date.now() + 10 * 86400000);
      vi.spyOn(service, 'findAllVehiculos').mockResolvedValue([
        { ...VEHICULO_BASE, vencRevTecnica: en10Dias, proxMantenimiento: en10Dias },
      ] as any);
      const alertas = await service.alertas('e1');
      expect(alertas).toHaveLength(2);
      const tipos = alertas.map(a => a.tipo);
      expect(tipos).toContain('Revisión Técnica');
      expect(tipos).toContain('Mantenimiento');
    });
  });
});
