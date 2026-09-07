import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProyectosService } from './proyectos.service';

describe('ProyectosService', () => {
  let prisma: any;
  let service: ProyectosService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new ProyectosService(prisma);
  });

  describe('findAll', () => {
    it('filtra solo activos por defecto', async () => {
      const txMock = { proyecto: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1');
      expect(txMock.proyecto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ activo: true }) }),
      );
    });

    it('aplica filtro de estado y clienteId cuando se pasan', async () => {
      const txMock = { proyecto: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1', { estado: 'EN_EJECUCION', clienteId: 'cli-1' });
      expect(txMock.proyecto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ estado: 'EN_EJECUCION', clienteId: 'cli-1' }) }),
      );
    });
  });

  describe('findOne', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.withTenant.mockResolvedValue(null);
      await expect(service.findOne('e1', 'x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('rechaza si el cliente indicado no existe en el tenant', async () => {
      const txCliente = { cliente: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txCliente));
      await expect(
        service.create('e1', { codigo: 'PRY-1', nombre: 'Ampliación Tajo', clienteId: 'cli-404' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza si el CDR indicado no existe en el tenant', async () => {
      const txCdr = { cDR: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txCdr));
      await expect(
        service.create('e1', { codigo: 'PRY-1', nombre: 'Ampliación Tajo', cdrId: 'cdr-404' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException en código duplicado (P2002)', async () => {
      prisma.withTenant.mockRejectedValue({ code: 'P2002' });
      await expect(
        service.create('e1', { codigo: 'DUP', nombre: 'X' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea el proyecto sin cliente ni CDR (ambos opcionales)', async () => {
      prisma.withTenant.mockResolvedValue({ id: 'p1', codigo: 'PRY-1', nombre: 'Interno' });
      const r = await service.create('e1', { codigo: 'PRY-1', nombre: 'Interno' } as any);
      expect(r.codigo).toBe('PRY-1');
    });
  });

  describe('reporteConsumo', () => {
    it('filtra solo SALIDA con pedidoInternoId no nulo, en el rango de fechas dado', async () => {
      const txMock = { movimiento: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.reporteConsumo('e1', { desde: '2026-09-01', hasta: '2026-09-30' });
      expect(txMock.movimiento.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tipo: 'SALIDA',
            pedidoInternoId: { not: null },
            fecha: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }),
          }),
        }),
      );
    });

    it('el límite "hasta" incluye TODO el día (no corta a medianoche UTC)', async () => {
      const txMock = { movimiento: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.reporteConsumo('e1', { hasta: '2026-09-04' });
      const { fecha } = (txMock.movimiento.findMany.mock.calls[0][0] as any).where;
      expect(fecha.lte.toISOString()).toBe('2026-09-04T23:59:59.999Z');
    });

    it('filtra por CDR y área vía los joins de proyecto/pedidoInterno', async () => {
      const txMock = { movimiento: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.reporteConsumo('e1', { cdrId: 'cdr-1', areaId: 'area-1' });
      expect(txMock.movimiento.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            proyecto: { cdrId: 'cdr-1' },
            pedidoInterno: { areaId: 'area-1' },
          }),
        }),
      );
    });
  });

  describe('pendientesPorDespachar', () => {
    it('excluye ENTREGADO/RECHAZADO y exige proyectoId no nulo', async () => {
      const txMock = { pedidoInterno: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.pendientesPorDespachar('e1', {});
      expect(txMock.pedidoInterno.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            proyectoId: { not: null },
            estado: { notIn: ['ENTREGADO', 'RECHAZADO'] },
          }),
        }),
      );
    });
  });

  describe('remove (soft-delete)', () => {
    it('marca activo=false, nunca borra la fila (PedidoInterno/Movimiento la referencian por FK)', async () => {
      const txMock = { proyecto: { update: vi.fn().mockResolvedValue({ id: 'p1', activo: false }) } };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'p1' })
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));
      await service.remove('e1', 'p1');
      expect(txMock.proyecto.update).toHaveBeenCalledWith(expect.objectContaining({ data: { activo: false } }));
    });
  });
});
