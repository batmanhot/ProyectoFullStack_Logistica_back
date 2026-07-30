import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RenovacionesService } from './renovaciones.service';

describe('RenovacionesService', () => {
  let prisma: any;
  let service: RenovacionesService;

  beforeEach(() => {
    prisma = {
      renovacionPlan: {
        findMany:  vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(),
        create:    vi.fn(),
        update:    vi.fn(),
      },
      empresa:  { findUnique: vi.fn(), update: vi.fn() },
      planSaaS: { findUnique: vi.fn() },
      $transaction: vi.fn((ops: any[]) => Promise.all(ops)),
    };
    service = new RenovacionesService(prisma);
  });

  describe('findAll', () => {
    it('devuelve todas las renovaciones sin filtros', async () => {
      await service.findAll();
      expect(prisma.renovacionPlan.findMany).toHaveBeenCalledOnce();
    });

    it('aplica filtro de empresaId cuando se provee', async () => {
      await service.findAll({ empresaId: 'e1' });
      expect(prisma.renovacionPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ empresaId: 'e1' }) }),
      );
    });
  });

  describe('findOne', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.renovacionPlan.findUnique.mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
    });

    it('devuelve la renovación si existe', async () => {
      prisma.renovacionPlan.findUnique.mockResolvedValue({ id: 'r1', estado: 'PAGADO' });
      expect((await service.findOne('r1')).estado).toBe('PAGADO');
    });
  });

  describe('create', () => {
    const dto = {
      empresaId: 'e1',
      planId: 'pro',
      monto: 299,
      moneda: 'PEN',
      ciclo: 'MENSUAL',
      periodoInicio: '2025-06-01',
      periodoFin: '2026-06-01',
    };

    it('rechaza si la empresa no existe', async () => {
      prisma.empresa.findUnique.mockResolvedValue(null);
      await expect(service.create(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('rechaza si el plan no existe', async () => {
      prisma.empresa.findUnique.mockResolvedValue({ id: 'e1' });
      prisma.planSaaS.findUnique.mockResolvedValue(null);
      await expect(service.create(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('crea la renovación cuando empresa y plan existen', async () => {
      prisma.empresa.findUnique.mockResolvedValue({ id: 'e1' });
      prisma.planSaaS.findUnique.mockResolvedValue({ id: 'pro' });
      prisma.renovacionPlan.create.mockResolvedValue({ id: 'r2', ...dto });
      const r = await service.create(dto as any);
      expect(r.id).toBe('r2');
    });
  });

  describe('anular', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.renovacionPlan.findUnique.mockResolvedValue(null);
      await expect(service.anular('x')).rejects.toThrow(NotFoundException);
    });

    it('marca estado=ANULADO (sin borrar la fila)', async () => {
      prisma.renovacionPlan.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.renovacionPlan.update.mockResolvedValue({ id: 'r1', estado: 'ANULADO' });
      await service.anular('r1');
      expect(prisma.renovacionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { estado: 'ANULADO' } }),
      );
    });
  });
});
