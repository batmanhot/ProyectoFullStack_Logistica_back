import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OportunidadesService } from './oportunidades.service';

const ACTOR_GESTION = { usuarioId: 'user-gerente', esVendedorBase: false };
const ACTOR_VENDEDOR = { usuarioId: 'user-vendedor', esVendedorBase: true };

describe('OportunidadesService', () => {
  let prisma: any;
  let service: OportunidadesService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new OportunidadesService(prisma);
  });

  describe('cambiarEstado', () => {
    it('califica una oportunidad NUEVA que ya tiene un seguimiento registrado', async () => {
      const tx = {
        oportunidad: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'op-1', responsableId: 'user-gerente', estado: 'NUEVA', fechaUltimaActividad: new Date('2026-09-02T10:00:00Z'),
          }),
          update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'op-1', ...data })),
        },
      };
      prisma.withTenant.mockImplementation((_empresaId: string, fn: any) => fn(tx));

      const resultado = await service.cambiarEstado('empresa-1', ACTOR_GESTION, 'op-1', { estado: 'CALIFICADA' } as any);

      expect(tx.oportunidad.update).toHaveBeenCalledWith({
        where: { id: 'op-1' },
        data: { estado: 'CALIFICADA', probabilidad: 30, motivoPerdida: null, fechaCierre: null },
      });
      expect(resultado).toMatchObject({ estado: 'CALIFICADA', probabilidad: 30 });
    });

    it('no permite calificar sin haber registrado un seguimiento', async () => {
      const tx = {
        oportunidad: {
          findFirst: vi.fn().mockResolvedValue({ id: 'op-1', responsableId: 'user-gerente', estado: 'NUEVA', fechaUltimaActividad: null }),
          update: vi.fn(),
        },
      };
      prisma.withTenant.mockImplementation((_empresaId: string, fn: any) => fn(tx));

      await expect(
        service.cambiarEstado('empresa-1', ACTOR_GESTION, 'op-1', { estado: 'CALIFICADA' } as any),
      ).rejects.toThrow(new BadRequestException('Registra un seguimiento antes de calificar la oportunidad'));
      expect(tx.oportunidad.update).not.toHaveBeenCalled();
    });

    it('un vendedor raso no puede cambiar el estado de la oportunidad de otro vendedor', async () => {
      const tx = {
        oportunidad: {
          findFirst: vi.fn().mockResolvedValue({ id: 'op-1', responsableId: 'otro-vendedor', estado: 'NUEVA', fechaUltimaActividad: null }),
          update: vi.fn(),
        },
      };
      prisma.withTenant.mockImplementation((_empresaId: string, fn: any) => fn(tx));

      await expect(
        service.cambiarEstado('empresa-1', ACTOR_VENDEDOR, 'op-1', { estado: 'CALIFICADA' } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.oportunidad.update).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('un vendedor raso no puede reasignar (cambiar responsableId), ni siquiera sobre su propia oportunidad', async () => {
      const tx = {
        oportunidad: {
          findFirst: vi.fn().mockResolvedValue({ id: 'op-1', responsableId: 'user-vendedor', estado: 'NUEVA' }),
          update: vi.fn(),
        },
      };
      prisma.withTenant.mockImplementation((_empresaId: string, fn: any) => fn(tx));

      await expect(
        service.update('empresa-1', ACTOR_VENDEDOR, 'op-1', { responsableId: 'otro-vendedor' } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.oportunidad.update).not.toHaveBeenCalled();
    });

    it('gestión (gerente/admin) sí puede reasignar', async () => {
      const tx = {
        oportunidad: {
          findFirst: vi.fn().mockResolvedValue({ id: 'op-1', responsableId: 'user-vendedor', estado: 'NUEVA' }),
          update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'op-1', ...data })),
        },
        usuario: { findFirst: vi.fn().mockResolvedValue({ id: 'otro-vendedor' }) },
      };
      prisma.withTenant.mockImplementation((_empresaId: string, fn: any) => fn(tx));

      const resultado = await service.update('empresa-1', ACTOR_GESTION, 'op-1', { responsableId: 'otro-vendedor' } as any);
      expect(resultado).toMatchObject({ responsableId: 'otro-vendedor' });
    });
  });

  describe('resolverActor', () => {
    it('marca esVendedorBase=true solo para el rol ejecutivo-comercial', async () => {
      prisma.withTenant.mockImplementation((_empresaId: string, fn: any) =>
        fn({ rol: { findFirst: vi.fn().mockResolvedValue({ codigo: 'ejecutivo-comercial' }) } }),
      );
      const actor = await service.resolverActor('empresa-1', 'user-1', 'rol-1');
      expect(actor).toEqual({ usuarioId: 'user-1', esVendedorBase: true });
    });

    it('marca esVendedorBase=false para gerente-operaciones', async () => {
      prisma.withTenant.mockImplementation((_empresaId: string, fn: any) =>
        fn({ rol: { findFirst: vi.fn().mockResolvedValue({ codigo: 'gerente-operaciones' }) } }),
      );
      const actor = await service.resolverActor('empresa-1', 'user-1', 'rol-1');
      expect(actor).toEqual({ usuarioId: 'user-1', esVendedorBase: false });
    });
  });
});
