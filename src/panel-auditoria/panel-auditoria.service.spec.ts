import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PanelAuditoriaService } from './panel-auditoria.service';

describe('PanelAuditoriaService', () => {
  let prismaMock: any;
  let service: PanelAuditoriaService;

  beforeEach(() => {
    prismaMock = { withTenant: vi.fn() };
    service = new PanelAuditoriaService(prismaMock);
  });

  describe('discrepancias', () => {
    it('devuelve [] cuando no hay líneas con diferencia', async () => {
      const txMock = { inventarioFisicoLinea: { findMany: vi.fn().mockResolvedValue([]) } };
      prismaMock.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      const r = await service.discrepancias('e1');

      expect(r).toEqual([]);
    });

    it('consulta withTenant con el empresaId recibido', async () => {
      const txMock = { inventarioFisicoLinea: { findMany: vi.fn().mockResolvedValue([]) } };
      prismaMock.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      await service.discrepancias('empresa-42');

      expect(prismaMock.withTenant).toHaveBeenCalledWith('empresa-42', expect.any(Function));
    });

    it('filtra por diferencia distinta de null y de 0, y limita a 500 filas', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const txMock = { inventarioFisicoLinea: { findMany } };
      prismaMock.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      await service.discrepancias('e1');

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            diferencia: { not: null },
            AND: [{ diferencia: { not: 0 } }],
            inventario: { empresaId: 'e1' },
          }),
          orderBy: { inventario: { fecha: 'desc' } },
          take: 500,
        }),
      );
    });

    it('agrega el filtro de almacenId al where.inventario cuando se pasa filtros.almacenId', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const txMock = { inventarioFisicoLinea: { findMany } };
      prismaMock.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      await service.discrepancias('e1', { almacenId: 'alm-1' });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            inventario: { empresaId: 'e1', almacenId: 'alm-1' },
          }),
        }),
      );
    });

    it('devuelve las filas con diferencia tal como las entrega la query (ya filtradas por Prisma)', async () => {
      const filas = [
        { id: 'l1', stockSistema: 10, stockFisico: 8, diferencia: -2, ajustado: false },
        { id: 'l2', stockSistema: 5, stockFisico: 7, diferencia: 2, ajustado: true },
      ];
      const txMock = { inventarioFisicoLinea: { findMany: vi.fn().mockResolvedValue(filas) } };
      prismaMock.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      const r = await service.discrepancias('e1');

      expect(r).toEqual(filas);
    });
  });
});
