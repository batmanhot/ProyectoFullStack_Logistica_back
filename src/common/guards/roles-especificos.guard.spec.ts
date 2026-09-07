import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RolesEspecificosGuard } from './roles-especificos.guard';

function contextConUsuario(user: any, rolesPermitidos: string[] | undefined, reflector: Reflector) {
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(rolesPermitidos);
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesEspecificosGuard', () => {
  let prisma: any;
  let reflector: Reflector;
  let guard: RolesEspecificosGuard;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    reflector = new Reflector();
    guard = new RolesEspecificosGuard(reflector, prisma);
  });

  it('deja pasar sin consultar nada si el handler no lleva @SoloRoles(...)', async () => {
    const ctx = contextConUsuario({ empresaId: 'e1', rolId: 'r1' }, undefined, reflector);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.withTenant).not.toHaveBeenCalled();
  });

  it('permite a un rol con permiso comodín (*) aunque no esté en la lista', async () => {
    prisma.withTenant.mockImplementation((_e: string, fn: any) =>
      fn({ rol: { findFirst: vi.fn().mockResolvedValue({ codigo: 'admin', permisos: [{ modulo: '*' }] }) } }),
    );
    const ctx = contextConUsuario({ empresaId: 'e1', rolId: 'r1' }, ['gerente-operaciones'], reflector);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('permite a un rol explícitamente listado (ej. supervisor para Almacenes)', async () => {
    prisma.withTenant.mockImplementation((_e: string, fn: any) =>
      fn({ rol: { findFirst: vi.fn().mockResolvedValue({ codigo: 'supervisor', permisos: [{ modulo: 'almacenes' }] }) } }),
    );
    const ctx = contextConUsuario({ empresaId: 'e1', rolId: 'r1' }, ['gerente-operaciones', 'supervisor'], reflector);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rechaza a un rol fuera de la lista (ej. ejecutivo-comercial para Almacenes)', async () => {
    prisma.withTenant.mockImplementation((_e: string, fn: any) =>
      fn({ rol: { findFirst: vi.fn().mockResolvedValue({ codigo: 'ejecutivo-comercial', permisos: [{ modulo: 'almacenes' }] }) } }),
    );
    const ctx = contextConUsuario({ empresaId: 'e1', rolId: 'r1' }, ['gerente-operaciones', 'supervisor'], reflector);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('rechaza a chofer para Transportistas, pero permite a coordinador-transporte', async () => {
    prisma.withTenant.mockImplementationOnce((_e: string, fn: any) =>
      fn({ rol: { findFirst: vi.fn().mockResolvedValue({ codigo: 'chofer', permisos: [{ modulo: 'transportes' }] }) } }),
    );
    const ctxChofer = contextConUsuario({ empresaId: 'e1', rolId: 'r1' }, ['gerente-operaciones', 'coordinador-transporte'], reflector);
    await expect(guard.canActivate(ctxChofer)).rejects.toThrow(ForbiddenException);

    prisma.withTenant.mockImplementationOnce((_e: string, fn: any) =>
      fn({ rol: { findFirst: vi.fn().mockResolvedValue({ codigo: 'coordinador-transporte', permisos: [{ modulo: 'transportes' }] }) } }),
    );
    const ctxCoordinador = contextConUsuario({ empresaId: 'e1', rolId: 'r2' }, ['gerente-operaciones', 'coordinador-transporte'], reflector);
    await expect(guard.canActivate(ctxCoordinador)).resolves.toBe(true);
  });
});
