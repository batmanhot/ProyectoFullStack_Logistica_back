import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlanesService } from './planes.service';

describe('PlanesService', () => {
  let prisma: any;
  let service: PlanesService;

  beforeEach(() => {
    prisma = {
      planSaaS: {
        findMany:  vi.fn(),
        findUnique: vi.fn(),
        create:    vi.fn(),
        update:    vi.fn(),
      },
    };
    service = new PlanesService(prisma);
  });

  describe('findAll', () => {
    it('devuelve solo activos por defecto', async () => {
      prisma.planSaaS.findMany.mockResolvedValue([{ id: 'pro', activo: true }]);
      await service.findAll();
      expect(prisma.planSaaS.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { activo: true } }),
      );
    });

    it('devuelve todos cuando incluirInactivos=true', async () => {
      prisma.planSaaS.findMany.mockResolvedValue([]);
      await service.findAll(true);
      expect(prisma.planSaaS.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  describe('findOne', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.planSaaS.findUnique.mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
    });

    it('devuelve el plan si existe', async () => {
      prisma.planSaaS.findUnique.mockResolvedValue({ id: 'pro', nombre: 'Pro' });
      expect((await service.findOne('pro')).nombre).toBe('Pro');
    });
  });

  describe('create', () => {
    it('crea un plan correctamente', async () => {
      const dto = { id: 'starter', nombre: 'Starter', precioMensual: 49, precioAnual: 490 };
      prisma.planSaaS.create.mockResolvedValue(dto);
      const r = await service.create(dto as any);
      expect(r.id).toBe('starter');
    });

    it('lanza BadRequestException en conflicto de id único (P2002)', async () => {
      prisma.planSaaS.create.mockRejectedValue({ code: 'P2002' });
      await expect(service.create({ id: 'pro' } as any)).rejects.toThrow(BadRequestException);
    });

    it('re-lanza errores desconocidos', async () => {
      prisma.planSaaS.create.mockRejectedValue(new Error('timeout'));
      await expect(service.create({ id: 'pro' } as any)).rejects.toThrow('timeout');
    });
  });

  describe('update', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.planSaaS.findUnique.mockResolvedValue(null);
      await expect(service.update('x', {})).rejects.toThrow(NotFoundException);
    });

    it('actualiza y devuelve el plan', async () => {
      prisma.planSaaS.findUnique.mockResolvedValue({ id: 'pro' });
      prisma.planSaaS.update.mockResolvedValue({ id: 'pro', nombre: 'Pro Max' });
      const r = await service.update('pro', { nombre: 'Pro Max' } as any);
      expect(r.nombre).toBe('Pro Max');
    });
  });

  describe('remove (soft-delete)', () => {
    it('marca activo=false en lugar de borrar', async () => {
      prisma.planSaaS.findUnique.mockResolvedValue({ id: 'pro' });
      prisma.planSaaS.update.mockResolvedValue({ id: 'pro', activo: false });
      await service.remove('pro');
      expect(prisma.planSaaS.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { activo: false } }),
      );
    });
  });
});
