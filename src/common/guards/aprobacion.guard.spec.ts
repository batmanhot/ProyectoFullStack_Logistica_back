import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AprobacionGuard } from './aprobacion.guard';

function makeCtx(user: any, proceso: string | undefined, reflector: Reflector) {
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(proceso as any);
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

/** withTenant que devuelve [regla, rol] para el Promise.all del guard. */
function withTenantDe(regla: any, rol: any) {
  return (_e: string, fn: any) =>
    fn({
      reglaAprobacion: { findUnique: vi.fn().mockResolvedValue(regla) },
      rol: { findFirst: vi.fn().mockResolvedValue(rol) },
    });
}

describe('AprobacionGuard', () => {
  let prisma: any;
  let reflector: Reflector;
  let guard: AprobacionGuard;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    reflector = new Reflector();
    guard = new AprobacionGuard(reflector, prisma);
  });

  it('pasa sin consultar nada si el handler no lleva @Aprobacion(...)', async () => {
    const ctx = makeCtx({ empresaId: 'e1', rolId: 'r1' }, undefined, reflector);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.withTenant).not.toHaveBeenCalled();
  });

  it('rechaza si no hay empresaId/rolId en el request', async () => {
    const ctx = makeCtx({}, 'PEDIDO_INTERNO', reflector);
    await expect(guard.canActivate(ctx)).resolves.toBe(false);
  });

  it('regla con lista vacía → no restringe', async () => {
    prisma.withTenant.mockImplementation(
      withTenantDe({ rolesAprobadores: [] }, { codigo: 'almacenero', permisos: [{ modulo: 'despachos' }] }),
    );
    const ctx = makeCtx({ empresaId: 'e1', rolId: 'r1' }, 'DESPACHO', reflector);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('permite a un rol listado explícitamente', async () => {
    prisma.withTenant.mockImplementation(
      withTenantDe(
        { rolesAprobadores: ['supervisor', 'gerente-operaciones'] },
        { codigo: 'supervisor', permisos: [{ modulo: 'pedidos-internos' }] },
      ),
    );
    const ctx = makeCtx({ empresaId: 'e1', rolId: 'r1' }, 'PEDIDO_INTERNO', reflector);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('permite a Owner/Admin (permiso *) aunque no estén en la lista', async () => {
    prisma.withTenant.mockImplementation(
      withTenantDe({ rolesAprobadores: ['supervisor'] }, { codigo: 'admin', permisos: [{ modulo: '*' }] }),
    );
    const ctx = makeCtx({ empresaId: 'e1', rolId: 'r1' }, 'PEDIDO_INTERNO', reflector);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rechaza a un rol fuera de la lista', async () => {
    prisma.withTenant.mockImplementation(
      withTenantDe(
        { rolesAprobadores: ['supervisor', 'gerente-operaciones'] },
        { codigo: 'almacenero', permisos: [{ modulo: 'pedidos-internos' }] },
      ),
    );
    const ctx = makeCtx({ empresaId: 'e1', rolId: 'r1' }, 'PEDIDO_INTERNO', reflector);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('sin fila de regla → usa el valor por defecto del proceso (PEDIDO_INTERNO)', async () => {
    // fallback = ['supervisor','gerente-operaciones']
    prisma.withTenant.mockImplementationOnce(
      withTenantDe(null, { codigo: 'supervisor', permisos: [{ modulo: 'pedidos-internos' }] }),
    );
    const ok = makeCtx({ empresaId: 'e1', rolId: 'r1' }, 'PEDIDO_INTERNO', reflector);
    await expect(guard.canActivate(ok)).resolves.toBe(true);

    prisma.withTenant.mockImplementationOnce(
      withTenantDe(null, { codigo: 'almacenero', permisos: [{ modulo: 'pedidos-internos' }] }),
    );
    const no = makeCtx({ empresaId: 'e1', rolId: 'r2' }, 'PEDIDO_INTERNO', reflector);
    await expect(guard.canActivate(no)).rejects.toThrow(ForbiddenException);
  });

  it('sin fila de regla → DESPACHO cae en [] (no restringe)', async () => {
    prisma.withTenant.mockImplementation(
      withTenantDe(null, { codigo: 'almacenero', permisos: [{ modulo: 'despachos' }] }),
    );
    const ctx = makeCtx({ empresaId: 'e1', rolId: 'r1' }, 'DESPACHO', reflector);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
