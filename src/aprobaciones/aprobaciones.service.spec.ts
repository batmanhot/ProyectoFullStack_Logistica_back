import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AprobacionesService } from './aprobaciones.service';

describe('AprobacionesService', () => {
  let prisma: any;
  let service: AprobacionesService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new AprobacionesService(prisma);
  });

  describe('listar', () => {
    it('devuelve los 4 procesos, con fila real o el valor por defecto', async () => {
      prisma.withTenant.mockImplementation((_e: string, fn: any) =>
        fn({
          reglaAprobacion: {
            findMany: vi.fn().mockResolvedValue([
              { proceso: 'PEDIDO_INTERNO', rolesAprobadores: ['gerente-operaciones'] },
            ]),
          },
        }),
      );

      const reglas = await service.listar('e1');
      expect(reglas).toHaveLength(6); // PEDIDO_INTERNO, DESPACHO, PEDIDO_PORTAL, FACTURA_B2B, INVENTARIO_FISICO, PROFORMA

      const pi = reglas.find((r) => r.proceso === 'PEDIDO_INTERNO')!;
      expect(pi.rolesAprobadores).toEqual(['gerente-operaciones']);
      expect(pi.porDefecto).toBe(false);

      // 2026-09-12: el default de DESPACHO dejó de ser [] (ver
      // aprobacion-procesos.ts) — mismo trío que PEDIDO_INTERNO.
      const desp = reglas.find((r) => r.proceso === 'DESPACHO')!;
      expect(desp.rolesAprobadores).toEqual(['admin', 'supervisor', 'gerente-operaciones']); // default
      expect(desp.porDefecto).toBe(true);
    });
  });

  describe('actualizar', () => {
    it('rechaza un proceso desconocido', async () => {
      await expect(service.actualizar('e1', 'NO_EXISTE', [])).rejects.toThrow(BadRequestException);
    });

    // Alcance de roles (2026-09-11): admin dejó de tener '*' — ya no se
    // descarta como owner, ahora se valida/persiste como cualquier otro rol.
    it('descarta owner (llave maestra) pero conserva admin como rol configurable', async () => {
      const upsert = vi.fn().mockResolvedValue({});
      prisma.withTenant.mockImplementation((_e: string, fn: any) =>
        fn({
          rol: { findMany: vi.fn().mockResolvedValue([{ codigo: 'supervisor' }, { codigo: 'admin' }]) },
          reglaAprobacion: { upsert },
        }),
      );

      const r = await service.actualizar('e1', 'PEDIDO_INTERNO', ['owner', 'admin', 'supervisor']);
      expect(r.rolesAprobadores).toEqual(['admin', 'supervisor']);
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ rolesAprobadores: ['admin', 'supervisor'] }),
          update: { rolesAprobadores: ['admin', 'supervisor'] },
        }),
      );
    });

    it('rechaza si un código de rol no existe en el catálogo', async () => {
      prisma.withTenant.mockImplementation((_e: string, fn: any) =>
        fn({
          rol: { findMany: vi.fn().mockResolvedValue([]) },
          reglaAprobacion: { upsert: vi.fn() },
        }),
      );
      await expect(service.actualizar('e1', 'DESPACHO', ['rol-fantasma'])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('acepta lista vacía (sin aprobador designado)', async () => {
      const upsert = vi.fn().mockResolvedValue({});
      prisma.withTenant.mockImplementation((_e: string, fn: any) =>
        fn({ rol: { findMany: vi.fn() }, reglaAprobacion: { upsert } }),
      );
      const r = await service.actualizar('e1', 'FACTURA_B2B', []);
      expect(r.rolesAprobadores).toEqual([]);
      expect(r.porDefecto).toBe(false);
    });
  });
});
