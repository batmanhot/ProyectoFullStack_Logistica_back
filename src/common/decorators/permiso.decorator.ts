import { SetMetadata } from '@nestjs/common';

/**
 * Mismo patrón que @Public() — metadata leída por PermisosGuard vía Reflector.
 *
 * Acepta un string (caso normal) o un array de strings (match por
 * CUALQUIERA de la lista) — necesario para endpoints alcanzables tanto por
 * el permiso completo de un módulo como por un permiso angosto que da acceso
 * parcial al mismo recurso (ej. 'despachos' vs 'despachos-aprobar': quien
 * solo puede aprobar igual necesita listar/ver el despacho puntual).
 */
export const PERMISO_KEY = 'permisoRequerido';
export const Permiso = (modulo: string | string[]) => SetMetadata(PERMISO_KEY, modulo);
