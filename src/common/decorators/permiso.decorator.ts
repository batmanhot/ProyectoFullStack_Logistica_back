import { SetMetadata } from '@nestjs/common';

/** Mismo patrón que @Public() — metadata leída por PermisosGuard vía Reflector. */
export const PERMISO_KEY = 'permisoRequerido';
export const Permiso = (modulo: string) => SetMetadata(PERMISO_KEY, modulo);
