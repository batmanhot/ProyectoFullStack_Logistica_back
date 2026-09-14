import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';

describe('auth-cookies', () => {
  const NODE_ENV_ORIG = process.env.NODE_ENV;
  const FRONTEND_URL_ORIG = process.env.FRONTEND_URL;

  afterEach(() => {
    process.env.NODE_ENV = NODE_ENV_ORIG;
    process.env.FRONTEND_URL = FRONTEND_URL_ORIG;
  });

  describe('setRefreshCookie — sameSite según entorno', () => {
    it('usa sameSite "lax" fuera de producción (front y API son el mismo site en dev)', async () => {
      process.env.NODE_ENV = 'test';
      vi.resetModules();
      const { setRefreshCookie } = await import('./auth-cookies');
      const res: any = { setCookie: vi.fn() };
      setRefreshCookie(res, { nombre: 'sp_rt', path: '/api/auth' }, 'tok', 3600);
      expect(res.setCookie).toHaveBeenCalledWith('sp_rt', 'tok', expect.objectContaining({ sameSite: 'lax', secure: false }));
    });

    it('usa sameSite "none" + secure en producción (front y API son sitios distintos en onrender.com)', async () => {
      process.env.NODE_ENV = 'production';
      vi.resetModules();
      const { setRefreshCookie } = await import('./auth-cookies');
      const res: any = { setCookie: vi.fn() };
      setRefreshCookie(res, { nombre: 'sp_rt', path: '/api/auth' }, 'tok', 3600);
      expect(res.setCookie).toHaveBeenCalledWith('sp_rt', 'tok', expect.objectContaining({ sameSite: 'none', secure: true }));
    });
  });

  describe('assertOrigenConfiable', () => {
    it('deja pasar cuando el header Origin coincide con FRONTEND_URL', async () => {
      process.env.FRONTEND_URL = 'https://proyectofullstack-logistica-front.onrender.com';
      vi.resetModules();
      const { assertOrigenConfiable } = await import('./auth-cookies');
      const req: any = { headers: { origin: 'https://proyectofullstack-logistica-front.onrender.com' } };
      expect(() => assertOrigenConfiable(req)).not.toThrow();
    });

    it('deja pasar cuando no viene header Origin (clientes no-browser)', async () => {
      process.env.FRONTEND_URL = 'https://proyectofullstack-logistica-front.onrender.com';
      vi.resetModules();
      const { assertOrigenConfiable } = await import('./auth-cookies');
      const req: any = { headers: {} };
      expect(() => assertOrigenConfiable(req)).not.toThrow();
    });

    it('rechaza cuando el header Origin no coincide (CSRF cross-site)', async () => {
      process.env.FRONTEND_URL = 'https://proyectofullstack-logistica-front.onrender.com';
      vi.resetModules();
      const { assertOrigenConfiable } = await import('./auth-cookies');
      const req: any = { headers: { origin: 'https://evil.com' } };
      expect(() => assertOrigenConfiable(req)).toThrow(UnauthorizedException);
    });
  });
});
