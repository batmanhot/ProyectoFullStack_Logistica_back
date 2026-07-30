import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AreasInternasService } from './areas-internas.service';

describe('AreasInternasService', () => {
  let prisma: any;
  let service: AreasInternasService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new AreasInternasService(prisma);
  });

  describe('findAll', () => {
    it('filtra solo activas por defecto', async () => {
      const txMock = { areaInterna: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1');
      expect(txMock.areaInterna.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ activo: true }) }),
      );
    });

    it('retorna todas (incluyendo inactivas) con incluirInactivas=true', async () => {
      const txMock = { areaInterna: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1', true);
      const callWhere = txMock.areaInterna.findMany.mock.calls[0][0].where;
      expect(callWhere).not.toHaveProperty('activo');
    });
  });

  describe('findOne', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.withTenant.mockResolvedValue(null);
      await expect(service.findOne('e1', 'x')).rejects.toThrow(NotFoundException);
    });

    it('devuelve el área si existe', async () => {
      prisma.withTenant.mockResolvedValue({ id: 'a1', nombre: 'Ventas' });
      expect((await service.findOne('e1', 'a1')).nombre).toBe('Ventas');
    });
  });

  describe('create', () => {
    it('crea un área con los datos del DTO', async () => {
      prisma.withTenant.mockResolvedValue({ id: 'a2', nombre: 'Almacén', codigo: 'ALM' });
      const r = await service.create('e1', { nombre: 'Almacén', codigo: 'ALM' } as any);
      expect(r.codigo).toBe('ALM');
    });

    it('lanza BadRequestException en código duplicado (P2002)', async () => {
      prisma.withTenant.mockRejectedValue({ code: 'P2002' });
      await expect(service.create('e1', { nombre: 'X', codigo: 'DUP' } as any))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.withTenant.mockResolvedValueOnce(null);
      await expect(service.update('e1', 'x', {})).rejects.toThrow(NotFoundException);
    });

    it('actualiza correctamente', async () => {
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'a1' })
        .mockResolvedValueOnce({ id: 'a1', nombre: 'Depósito' });
      const r = await service.update('e1', 'a1', { nombre: 'Depósito' });
      expect(r.nombre).toBe('Depósito');
    });
  });

  describe('remove (soft-delete)', () => {
    it('marca activo=false', async () => {
      const txMock = { areaInterna: { update: vi.fn().mockResolvedValue({ id: 'a1', activo: false }) } };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'a1' })
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));
      await service.remove('e1', 'a1');
      expect(txMock.areaInterna.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { activo: false } }),
      );
    });
  });
});
