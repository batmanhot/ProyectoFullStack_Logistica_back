import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedException } from '@nestjs/common';

/**
 * #5 (2026-09-10): el refresh token va en cookie httpOnly, no en el body ni en
 * localStorage — un XSS ya no puede robar la credencial de larga duración.
 *
 * Fix 2026-09-14: se asumía que `sameSite: 'lax'` alcanzaba porque front y API
 * eran "el mismo site (ambos bajo onrender.com)" — supuesto FALSO: onrender.com
 * está en la Public Suffix List (confirmado contra publicsuffix.org), así que
 * `stockpro-api-ykbd.onrender.com` y `proyectofullstack-logistica-front.onrender.com`
 * son sitios DISTINTOS para el navegador aunque compartan la terminación. Con
 * `lax`, el navegador nunca mandaba la cookie en el fetch cross-site que hace
 * el front al recargar → /refresh fallaba 401 → la sesión se descartaba →
 * landing en cada F5 (afectaba SuperAdmin y tenant por igual).
 *
 * En prod pasa a `sameSite: 'none'` (exige `secure: true`, ya lo era). Eso
 * habilita que cualquier sitio dispare un POST a /refresh con la cookie
 * puesta (CSRF) — CORS ya impide que ese sitio LEA la respuesta (el origin no
 * está en la whitelist), pero igual podría forzar una rotación de tokens no
 * pedida. Se compensa validando el header `Origin` contra FRONTEND_URL en los
 * endpoints de refresh (`assertOrigenConfiable`, más abajo) — un atacante
 * cross-site no puede falsificar ese header desde fetch/XHR/form, así que
 * alcanza sin sumar un token CSRF aparte mientras el front sea un origin único
 * conocido. En dev, front y API son el mismo site (localhost) → sigue en 'lax'.
 */
const PROD = process.env.NODE_ENV === 'production';
const SAME_SITE: 'lax' | 'none' = PROD ? 'none' : 'lax';

export const RT_COOKIE = {
  tenant: { nombre: 'sp_rt', path: '/api/auth' },
  admin: { nombre: 'sp_admin_rt', path: '/api/admin/auth' },
  portalCliente: { nombre: 'sp_portal_rt', path: '/api/portal' },
  portalProveedor: { nombre: 'sp_portal_prov_rt', path: '/api/portal-proveedor' },
} as const;

/**
 * Nombre de la cookie de refresh de un tenant: UNA POR EMPRESA. Así conviven en
 * el mismo navegador varias sesiones de negocio distintas (una por pestaña) sin
 * pisarse — antes `sp_rt` era único y el último login ganaba. El id de empresa
 * ya viene validado como `/^[a-z0-9]+$/i` (tenantContextSql), pero se sanea
 * igual por defensa en profundidad.
 */
export function nombreCookieTenant(empresaId: string): string {
  const safe = String(empresaId || '')
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 40);
  return `sp_rt_${safe}`;
}

/** cfg de `setRefreshCookie`/`clearRefreshCookie` para el tenant `empresaId`. */
export function cookieTenant(empresaId: string): { nombre: string; path: string } {
  return { nombre: nombreCookieTenant(empresaId), path: RT_COOKIE.tenant.path };
}

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
    sameSite: SAME_SITE,
    path: cfg.path,
    maxAge: maxAgeSeg,
  });
}

export function clearRefreshCookie(res: FastifyReply, cfg: { nombre: string; path: string }): void {
  res.clearCookie(cfg.nombre, { path: cfg.path });
}

const FRONTEND_ORIGIN = process.env.FRONTEND_URL ?? 'http://localhost:5173';

/**
 * Compensa el CSRF que `sameSite:'none'` deja de cubrir en los endpoints que
 * solo dependen de la cookie de refresh (sin ningún otro secreto en la
 * request). El navegador no deja que JS de otro origin falsifique el header
 * `Origin` en un fetch/XHR/form POST, así que compararlo contra FRONTEND_URL
 * alcanza. Solo rechaza si el header VINO y no matchea — ausente se deja
 * pasar (algunos clientes no-browser no lo mandan; el riesgo de CSRF es
 * específicamente del navegador, que sí lo manda siempre en POST).
 */
export function assertOrigenConfiable(req: FastifyRequest): void {
  const origin = req.headers.origin;
  if (origin && origin !== FRONTEND_ORIGIN) {
    throw new UnauthorizedException('Origen no confiable');
  }
}
