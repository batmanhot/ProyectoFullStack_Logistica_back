import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';

vi.mock('bcryptjs', () => ({
  default: { compare: vi.fn() },
  compare: vi.fn(),
}));

import * as bcrypt from 'bcryptjs';

describe('AdminAuthService', () => {
  let prisma: any;
  let jwt: any;
  let service: AdminAuthService;

  beforeEach(() => {
    prisma = {
      platformAdmin: { findUnique: vi.fn() },
      auditoriaPlataforma: { create: vi.fn().mockResolvedValue({}) },
    };
    jwt = {
      signAsync: vi.fn().mockResolvedValue('jwt.token.here'),
      verifyAsync: vi.fn(),
    };
    service = new AdminAuthService(prisma, jwt);
    vi.mocked(bcrypt.compare).mockReset();
  });

  it('lanza UnauthorizedException si el admin no existe', async () => {
    prisma.platformAdmin.findUnique.mockResolvedValue(null);
    await expect(service.login('x@x.com', 'pass')).rejects.toThrow(UnauthorizedException);
  });

  it('lanza UnauthorizedException si el admin está inactivo', async () => {
    prisma.platformAdmin.findUnique.mockResolvedValue({ id: 'a1', activo: false, passwordHash: 'h' });
    await expect(service.login('x@x.com', 'pass')).rejects.toThrow(UnauthorizedException);
  });

  it('lanza UnauthorizedException si la contraseña es incorrecta', async () => {
    prisma.platformAdmin.findUnique.mockResolvedValue({
      id: 'a1', activo: true, email: 'a@a.com', nombre: 'Admin', passwordHash: '$hash$',
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    await expect(service.login('a@a.com', 'mal')).rejects.toThrow(UnauthorizedException);
  });

  it('devuelve accessToken, refreshToken y datos del admin en login exitoso', async () => {
    const admin = { id: 'a1', activo: true, email: 'a@a.com', nombre: 'Admin One', passwordHash: '$hash$' };
    prisma.platformAdmin.findUnique.mockResolvedValue(admin);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const r = await service.login('a@a.com', 'correcto');
    expect(r.accessToken).toBe('jwt.token.here');
    expect(r.refreshToken).toBe('jwt.token.here');
    expect(jwt.signAsync).toHaveBeenCalledTimes(2); // access + refresh, secretos distintos
    expect(r.admin).toEqual({ id: 'a1', email: 'a@a.com', nombre: 'Admin One' });
  });

  describe('refresh', () => {
    it('lanza UnauthorizedException si el refresh token no verifica', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('bad token'));
      await expect(service.refresh('roto')).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si la cuenta ya no está activa', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'a1', email: 'a@a.com' });
      prisma.platformAdmin.findUnique.mockResolvedValue({ id: 'a1', activo: false });
      await expect(service.refresh('valido')).rejects.toThrow(UnauthorizedException);
    });

    it('emite un par nuevo sin auditar cuando el refresh es válido', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'a1', email: 'a@a.com' });
      prisma.platformAdmin.findUnique.mockResolvedValue({ id: 'a1', activo: true, email: 'a@a.com', nombre: 'Admin One' });

      const r = await service.refresh('valido');
      expect(r.accessToken).toBe('jwt.token.here');
      expect(r.refreshToken).toBe('jwt.token.here');
      expect(prisma.auditoriaPlataforma.create).not.toHaveBeenCalled();
    });
  });
});
