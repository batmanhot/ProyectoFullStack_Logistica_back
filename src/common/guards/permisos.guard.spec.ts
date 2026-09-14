import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermisosGuard } from './permisos.guard';

function makeCtx(user: any, modulo: string | string[] | undefined, reflector: Reflector) {
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(modulo as any);
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('PermisosGuard', () => {
  let rolesService: any;
  let prisma: any;
  let reflector: Reflector;
  let guard: PermisosGuard;

  beforeEach(() => {
    rolesService = { verificarPermiso: vi.fn() };
    prisma = { empresa: { findUnique: vi.fn() }, planSaaS: { findUnique: vi.fn() } };
    reflector = new Reflector();
    guard = new PermisosGuard(reflector, rolesService, prisma);
  });

  it('pasa sin consultar nada si el handler no lleva @Permiso(...)', async () => {
    const ctx = makeCtx({ empresaId: 'e1', rolId: 'r1' }, undefined, reflector);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(rolesService.verificarPermiso).not.toHaveBeenCalled();
  });

  it('rechaza si no hay empresaId/rolId en el request', async () => {
    const ctx = makeCtx({}, 'despachos', reflector);
    await expect(guard.canActivate(ctx)).resolves.toBe(false);
  });

  it('rechaza si el rol no tiene el módulo', async () => {
    rolesService.verificarPermiso.mockResolvedValue({ permitido: false, viaComodin: false });
    const ctx = makeCtx({ empresaId: 'e1', rolId: 'r1' }, 'despachos', reflector);
    await expect(guard.canActivate(ctx)).resolves.toBe(false);
  });

  it('permite sin cruzar plan si matcheó por comodín', async () => {
    rolesService.verificarPermiso.mockResolvedValue({ permitido: true, viaComodin: true });
    const ctx = makeCtx({ empresaId: 'e1', rolId: 'r1' }, 'financiero', reflector);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.empresa.findUnique).not.toHaveBeenCalled();
  });

  it('un módulo sin grupo de plan asociado (administración interna) pasa sin cruzar plan', async () => {
    rolesService.verificarPermiso.mockResolvedValue({ permitido: true, viaComodin: false });
    const ctx = makeCtx({ empresaId: 'e1', rolId: 'r1' }, 'usuarios', reflector);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.empresa.findUnique).not.toHaveBeenCalled();
  });

  // Alcance de roles (2026-09-11): @Permiso ahora acepta un array — match
  // por cualquiera de la lista (permiso completo O uno angosto).
  it('con un array de módulos, pasa el array entero a verificarPermiso', async () => {
    rolesService.verificarPermiso.mockResolvedValue({ permitido: true, viaComodin: false });
    const ctx = makeCtx({ empresaId: 'e1', rolId: 'r1' }, ['despachos', 'despachos-aprobar'], reflector);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(rolesService.verificarPermiso).toHaveBeenCalledWith('e1', 'r1', ['despachos', 'despachos-aprobar']);
  });

  it('con un array, si ninguno tiene grupo de plan, no cruza plan', async () => {
    rolesService.verificarPermiso.mockResolvedValue({ permitido: true, viaComodin: false });
    const ctx = makeCtx({ empresaId: 'e1', rolId: 'r1' }, ['no-existe-1', 'no-existe-2'], reflector);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.empresa.findUnique).not.toHaveBeenCalled();
  });

  it('con un array donde uno de los dos sí tiene grupo de plan, cruza usando ese grupo', async () => {
    rolesService.verificarPermiso.mockResolvedValue({ permitido: true, viaComodin: false });
    prisma.empresa.findUnique.mockResolvedValue({ plan: 'p1' });
    prisma.planSaaS.findUnique.mockResolvedValue({ modulosIncluidos: ['despachos'] });
    const ctx = makeCtx({ empresaId: 'e1', rolId: 'r1' }, ['despachos', 'despachos-aprobar'], reflector);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('el plan de la empresa no incluye el grupo del módulo → rechaza', async () => {
    rolesService.verificarPermiso.mockResolvedValue({ permitido: true, viaComodin: false });
    prisma.empresa.findUnique.mockResolvedValue({ plan: 'p1' });
    prisma.planSaaS.findUnique.mockResolvedValue({ modulosIncluidos: ['compras'] });
    const ctx = makeCtx({ empresaId: 'e1', rolId: 'r1' }, 'despachos', reflector);
    await expect(guard.canActivate(ctx)).resolves.toBe(false);
  });
});
