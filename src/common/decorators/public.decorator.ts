import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca una ruta como pública (sin JWT). Úsalo solo en:
 *   - GET /api/empresas/:codigo  (paso 1 del login)
 *   - POST /api/auth/login       (paso 2 del login)
 *   - POST /api/auth/refresh     (renovación de access token)
 * Ninguna otra ruta tenant-scoped debe usar este decorador (sección 6.4).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
