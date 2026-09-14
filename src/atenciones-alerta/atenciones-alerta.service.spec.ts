import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AtencionesAlertaService } from './atenciones-alerta.service';

describe('AtencionesAlertaService', () => {
  let prisma: any;
  let service: AtencionesAlertaService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new AtencionesAlertaService(prisma);
  });

  describe('listar', () => {
    it('devuelve las atenciones del tenant', async () => {
      const findMany = vi.fn().mockResolvedValue([
        { tipo: 'stock_critico', clave: 'p1', notaAccion: 'Se generó OC de reposición.' },
      ]);
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn({ atencionAlerta: { findMany } }));

      const r = await service.listar('e1');
      expect(r).toHaveLength(1);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { empresaId: 'e1' } }),
      );
    });
  });

  describe('marcarAtendida', () => {
    it('hace upsert por [empresaId, tipo, clave]', async () => {
      const upsert = vi.fn().mockResolvedValue({ id: 'a1' });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn({ atencionAlerta: { upsert } }));

      await service.marcarAtendida('e1', 'u1', { tipo: 'oc_pendiente', clave: 'OC-0001', notaAccion: 'Aprobada por gerencia.' });

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { empresaId_tipo_clave: { empresaId: 'e1', tipo: 'oc_pendiente', clave: 'OC-0001' } },
          create: expect.objectContaining({ empresaId: 'e1', tipo: 'oc_pendiente', clave: 'OC-0001', notaAccion: 'Aprobada por gerencia.', usuarioId: 'u1' }),
          update: expect.objectContaining({ notaAccion: 'Aprobada por gerencia.', usuarioId: 'u1' }),
        }),
      );
    });
  });

  describe('reabrir', () => {
    it('borra la fila de atención (vuelve a Pendiente)', async () => {
      const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn({ atencionAlerta: { deleteMany } }));

      const r = await service.reabrir('e1', 'stock_critico', 'p1');

      expect(deleteMany).toHaveBeenCalledWith({ where: { empresaId: 'e1', tipo: 'stock_critico', clave: 'p1' } });
      expect(r).toEqual({ ok: true });
    });
  });
});
