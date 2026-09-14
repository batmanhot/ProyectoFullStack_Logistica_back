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

  it('permite a Owner (permiso *) aunque no esté en la lista', async () => {
    prisma.withTenant.mockImplementation(
      withTenantDe({ rolesAprobadores: ['supervisor'] }, { codigo: 'owner', permisos: [{ modulo: '*' }] }),
    );
    const ctx = makeCtx({ empresaId: 'e1', rolId: 'r1' }, 'PEDIDO_INTERNO', reflector);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  // Alcance de roles (2026-09-11): admin dejó de tener '*' — ahora depende,
  // como cualquier otro rol, de estar listado en rolesAprobadores (o del
  // fallback por defecto, que sí lo incluye para PEDIDO_INTERNO).
  it('rechaza a admin SIN comodín si no está en la lista configurada', async () => {
    prisma.withTenant.mockImplementation(
      withTenantDe(
        { rolesAprobadores: ['supervisor'] },
        { codigo: 'admin', permisos: [{ modulo: 'pedidos-internos-aprobar' }] },
      ),
    );
    const ctx = makeCtx({ empresaId: 'e1', rolId: 'r1' }, 'PEDIDO_INTERNO', reflector);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('permite a admin SIN comodín cuando SÍ está en la lista configurada', async () => {
    prisma.withTenant.mockImplementation(
      withTenantDe(
        { rolesAprobadores: ['admin', 'supervisor'] },
        { codigo: 'admin', permisos: [{ modulo: 'pedidos-internos-aprobar' }] },
      ),
    );
    const ctx = makeCtx({ empresaId: 'e1', rolId: 'r1' }, 'PEDIDO_INTERNO', reflector);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('sin fila de regla → el default de PEDIDO_INTERNO ya incluye a admin', async () => {
    prisma.withTenant.mockImplementation(
      withTenantDe(null, { codigo: 'admin', permisos: [{ modulo: 'pedidos-internos-aprobar' }] }),
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

  // 2026-09-12: el default de DESPACHO dejó de ser [] — un Almacenero podía
  // crear Y aprobar su propio despacho (sin separación de funciones), justo
  // lo que 'despachos-aprobar' (Admin/Gerente de Operaciones) existe para
  // evitar. Ahora, sin fila de regla, cae en el mismo trío que PEDIDO_INTERNO.
  it('sin fila de regla → DESPACHO cae en [admin, supervisor, gerente-operaciones] (Almacenero ya no autoaprueba)', async () => {
    prisma.withTenant.mockImplementationOnce(
      withTenantDe(null, { codigo: 'almacenero', permisos: [{ modulo: 'despachos' }] }),
    );
    const no = makeCtx({ empresaId: 'e1', rolId: 'r1' }, 'DESPACHO', reflector);
    await expect(guard.canActivate(no)).rejects.toThrow(ForbiddenException);

    prisma.withTenant.mockImplementationOnce(
      withTenantDe(null, { codigo: 'supervisor', permisos: [{ modulo: 'despachos' }] }),
    );
    const ok = makeCtx({ empresaId: 'e1', rolId: 'r2' }, 'DESPACHO', reflector);
    await expect(guard.canActivate(ok)).resolves.toBe(true);
  });
});
