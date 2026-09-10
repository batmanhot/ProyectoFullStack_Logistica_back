import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from './jwt-auth.guard';

function ctx(request: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

const PAYLOAD = { sub: 'u1', empresaId: 'e1', email: 'a@x.pe', rolId: 'r1', tokenVersion: 3 };

describe('JwtAuthGuard', () => {
  let jwt: any;
  let reflector: Reflector;
  let prisma: any;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    jwt = { verifyAsync: vi.fn().mockResolvedValue(PAYLOAD) };
    reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    prisma = {
      withTenant: vi.fn().mockImplementation((_e: string, fn: any) =>
        fn({ usuario: { findUnique: vi.fn().mockResolvedValue({ activo: true, tokenVersion: 3 }) } }),
      ),
    };
    guard = new JwtAuthGuard(jwt, reflector, prisma);
  });

  it('deja pasar rutas @Public() sin mirar el token', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    await expect(guard.canActivate(ctx({ method: 'GET', headers: {} }))).resolves.toBe(true);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('deja pasar OPTIONS (preflight CORS)', async () => {
    await expect(guard.canActivate(ctx({ method: 'OPTIONS', headers: {} }))).resolves.toBe(true);
  });

  it('rechaza si no hay token', async () => {
    await expect(guard.canActivate(ctx({ method: 'GET', headers: {} }))).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token con firma inválida', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('bad'));
    await expect(
      guard.canActivate(ctx({ method: 'GET', headers: { authorization: 'Bearer x' } })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('token válido + usuario activo + tokenVersion coincide → pasa y puebla request.user', async () => {
    const req: any = { method: 'GET', headers: { authorization: 'Bearer x' } };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(req.user).toEqual(PAYLOAD);
  });

  it('rechaza si el usuario está desactivado', async () => {
    prisma.withTenant.mockImplementation((_e: string, fn: any) =>
      fn({ usuario: { findUnique: vi.fn().mockResolvedValue({ activo: false, tokenVersion: 3 }) } }),
    );
    await expect(
      guard.canActivate(ctx({ method: 'GET', headers: { authorization: 'Bearer x' } })),
    ).rejects.toThrow(/desactivada|no existe/);
  });

  it('rechaza si el usuario ya no existe', async () => {
    prisma.withTenant.mockImplementation((_e: string, fn: any) =>
      fn({ usuario: { findUnique: vi.fn().mockResolvedValue(null) } }),
    );
    await expect(
      guard.canActivate(ctx({ method: 'GET', headers: { authorization: 'Bearer x' } })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza si el tokenVersion no coincide (sesión revocada)', async () => {
    prisma.withTenant.mockImplementation((_e: string, fn: any) =>
      fn({ usuario: { findUnique: vi.fn().mockResolvedValue({ activo: true, tokenVersion: 4 }) } }),
    );
    await expect(
      guard.canActivate(ctx({ method: 'GET', headers: { authorization: 'Bearer x' } })),
    ).rejects.toThrow(/revocada/);
  });

  it('token legacy sin tokenVersion en el payload: pasa si la cuenta está activa', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', empresaId: 'e1', email: 'a@x.pe', rolId: 'r1' });
    await expect(
      guard.canActivate(ctx({ method: 'GET', headers: { authorization: 'Bearer x' } })),
    ).resolves.toBe(true);
  });

  it('cachea el estado de cuenta (no consulta la base dos veces seguidas)', async () => {
    const req = () => ctx({ method: 'GET', headers: { authorization: 'Bearer x' } });
    await guard.canActivate(req());
    await guard.canActivate(req());
    expect(prisma.withTenant).toHaveBeenCalledTimes(1);
  });
});
