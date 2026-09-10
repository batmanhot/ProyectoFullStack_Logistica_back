import type { FastifyReply } from 'fastify';

/**
 * #5 (2026-09-10): el refresh token va en cookie httpOnly, no en el body ni en
 * localStorage — un XSS ya no puede robar la credencial de larga duración.
 *
 * `sameSite: 'lax'` alcanza como anti-CSRF acá porque el frontend y la API son
 * el MISMO site (ambos bajo onrender.com, o localhost en dev): la cookie viaja
 * en el XHR front→api pero NO en una request cross-site de un evil.com. Si algún
 * día el frontend se sirve desde otro dominio, hay que pasar a
 * `sameSite: 'none'` + token CSRF double-submit en /refresh.
 */
const PROD = process.env.NODE_ENV === 'production';

export const RT_COOKIE = {
  tenant: { nombre: 'sp_rt', path: '/api/auth' },
  admin: { nombre: 'sp_admin_rt', path: '/api/admin/auth' },
  portalCliente: { nombre: 'sp_portal_rt', path: '/api/portal' },
  portalProveedor: { nombre: 'sp_portal_prov_rt', path: '/api/portal-proveedor' },
} as const;

/** Convierte '7d' / '30d' / '900s' / '15m' a segundos. */
export function expEnSegundos(exp: string | undefined, fallbackSeg: number): number {
  if (!exp) return fallbackSeg;
  const m = /^(\d+)\s*([smhd])$/.exec(exp.trim());
  if (!m) return fallbackSeg;
  const n = Number(m[1]);
  return n * { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as 's' | 'm' | 'h' | 'd'];
}

export function setRefreshCookie(
  res: FastifyReply,
  cfg: { nombre: string; path: string },
  token: string,
  maxAgeSeg: number,
): void {
  res.setCookie(cfg.nombre, token, {
    httpOnly: true,
    secure: PROD, // en dev sobre http://localhost, Secure impediría enviarla
    sameSite: 'lax',
    path: cfg.path,
    maxAge: maxAgeSeg,
  });
}

export function clearRefreshCookie(res: FastifyReply, cfg: { nombre: string; path: string }): void {
  res.clearCookie(cfg.nombre, { path: cfg.path });
}
