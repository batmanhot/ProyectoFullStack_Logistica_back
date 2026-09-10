import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformAdminGuard } from './platform-admin.guard';

function ctx(request: any): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('PlatformAdminGuard', () => {
  let jwt: any;
  let prisma: any;
  let guard: PlatformAdminGuard;

  beforeEach(() => {
    jwt = { verifyAsync: vi.fn().mockResolvedValue({ sub: 'a1', email: 'admin@x.pe' }) };
    prisma = { platformAdmin: { findUnique: vi.fn().mockResolvedValue({ activo: true }) } };
    guard = new PlatformAdminGuard(jwt, prisma);
  });

  it('rechaza si no hay token', async () => {
    await expect(guard.canActivate(ctx({ headers: {} }))).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token con firma inválida', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('bad'));
    await expect(
      guard.canActivate(ctx({ headers: { authorization: 'Bearer x' } })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('token válido + admin activo → pasa y puebla request.platformAdmin', async () => {
    const req: any = { headers: { authorization: 'Bearer x' } };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(req.platformAdmin).toEqual({ sub: 'a1', email: 'admin@x.pe' });
  });

  it('rechaza si el admin fue desactivado', async () => {
    prisma.platformAdmin.findUnique.mockResolvedValue({ activo: false });
    await expect(
      guard.canActivate(ctx({ headers: { authorization: 'Bearer x' } })),
    ).rejects.toThrow(/desactivada|no existe/);
  });

  it('rechaza si el admin fue eliminado', async () => {
    prisma.platformAdmin.findUnique.mockResolvedValue(null);
    await expect(
      guard.canActivate(ctx({ headers: { authorization: 'Bearer x' } })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('cachea el estado (una sola consulta en llamadas seguidas)', async () => {
    await guard.canActivate(ctx({ headers: { authorization: 'Bearer x' } }));
    await guard.canActivate(ctx({ headers: { authorization: 'Bearer x' } }));
    expect(prisma.platformAdmin.findUnique).toHaveBeenCalledTimes(1);
  });
});
