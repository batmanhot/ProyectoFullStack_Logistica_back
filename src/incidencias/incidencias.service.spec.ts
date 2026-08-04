import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IncidenciasService } from './incidencias.service';
import { SeveridadIncidencia } from '@prisma/client';

describe('IncidenciasService', () => {
  let prisma: any;
  let service: IncidenciasService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn(), empresa: { findMany: vi.fn() } };
    service = new IncidenciasService(prisma);
  });

  describe('findAll', () => {
    function mockTx(registros: any[]) {
      return {
        registroIncidencia: {
          findMany: vi.fn().mockResolvedValue(registros),
          count: vi.fn().mockResolvedValue(registros.length),
        },
      };
    }

    it('llama withTenant, pagina con skip/take y devuelve data + total + kpis', async () => {
      const registros = [{ id: 'i1', mensaje: 'boom', severidad: SeveridadIncidencia.CRITICO }];
      const txMock = mockTx(registros);
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      const r = await service.findAll('e1', {}, { page: 2, pageSize: 10 });

      expect(txMock.registroIncidencia.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
      expect(r.data).toEqual(registros);
      expect(r.page).toBe(2);
      expect(r.pageSize).toBe(10);
      expect(r.kpis.total).toBe(registros.length);
    });

    it('acepta filtros opcionales sin lanzar error', async () => {
      const txMock = mockTx([]);
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      const r = await service.findAll('e1', {
        severidad: SeveridadIncidencia.ALTO,
        modulo: 'despachos',
        resuelto: false,
        busqueda: 'timeout',
        desde: '2026-01-01',
        hasta: '2026-12-31',
      });
      expect(Array.isArray(r.data)).toBe(true);
    });
  });

  describe('registrar', () => {
    it('crea un registro de incidencia con los datos provistos', async () => {
      const txMock = { registroIncidencia: { create: vi.fn().mockResolvedValue({ id: 'i2' }) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.registrar('e1', {
        modulo: 'despachos',
        opcion: 'POST /api/despachos',
        codigoError: 500,
        mensaje: 'Error interno',
        severidad: SeveridadIncidencia.CRITICO,
      });
      expect(txMock.registroIncidencia.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ empresaId: 'e1', codigoError: 500, severidad: SeveridadIncidencia.CRITICO }),
        }),
      );
    });
  });

  describe('marcarResuelta', () => {
    it('actualiza resuelto=true y la nota provista', async () => {
      const txMock = { registroIncidencia: { update: vi.fn().mockResolvedValue({ id: 'i3', resuelto: true }) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.marcarResuelta('e1', 'i3', 'Ya se corrigió el bug');
      expect(txMock.registroIncidencia.update).toHaveBeenCalledWith({
        where: { id: 'i3', empresaId: 'e1' },
        data: { resuelto: true, notaResolucion: 'Ya se corrigió el bug' },
      });
    });
  });

  describe('purgarResueltasAntiguas', () => {
    it('recorre cada empresa vía withTenant y suma los borrados', async () => {
      prisma.empresa.findMany.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);
      const txMock = { registroIncidencia: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      const total = await service.purgarResueltasAntiguas();

      expect(prisma.withTenant).toHaveBeenCalledTimes(2);
      expect(total).toBe(6);
    });

    it('no falla si no hay empresas', async () => {
      prisma.empresa.findMany.mockResolvedValue([]);
      const total = await service.purgarResueltasAntiguas();
      expect(total).toBe(0);
      expect(prisma.withTenant).not.toHaveBeenCalled();
    });
  });
});
