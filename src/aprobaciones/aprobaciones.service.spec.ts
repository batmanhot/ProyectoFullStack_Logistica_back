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
      expect(reglas).toHaveLength(4);

      const pi = reglas.find((r) => r.proceso === 'PEDIDO_INTERNO')!;
      expect(pi.rolesAprobadores).toEqual(['gerente-operaciones']);
      expect(pi.porDefecto).toBe(false);

      const desp = reglas.find((r) => r.proceso === 'DESPACHO')!;
      expect(desp.rolesAprobadores).toEqual([]); // default
      expect(desp.porDefecto).toBe(true);
    });
  });

  describe('actualizar', () => {
    it('rechaza un proceso desconocido', async () => {
      await expect(service.actualizar('e1', 'NO_EXISTE', [])).rejects.toThrow(BadRequestException);
    });

    it('descarta owner/admin y valida los códigos contra el catálogo de roles', async () => {
      const upsert = vi.fn().mockResolvedValue({});
      prisma.withTenant.mockImplementation((_e: string, fn: any) =>
        fn({
          rol: { findMany: vi.fn().mockResolvedValue([{ codigo: 'supervisor' }]) },
          reglaAprobacion: { upsert },
        }),
      );

      const r = await service.actualizar('e1', 'PEDIDO_INTERNO', ['owner', 'admin', 'supervisor']);
      expect(r.rolesAprobadores).toEqual(['supervisor']);
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ rolesAprobadores: ['supervisor'] }),
          update: { rolesAprobadores: ['supervisor'] },
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
