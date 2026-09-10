import { SetMetadata } from '@nestjs/common';
import { ProcesoAprobacion } from '@prisma/client';

/**
 * MEJORAS-DIFERIDAS #11b (2026-09-10): saca del código el "quién aprueba".
 *
 * Marca un handler de aprobación (aprobar / rechazar de un proceso) para que
 * AprobacionGuard exija que el rol del usuario esté en `ReglaAprobacion.
 * rolesAprobadores` de su empresa para ese proceso. Reemplaza al `@SoloRoles`
 * hardcodeado donde lo había (Pedido Interno) y agrega el gate donde no
 * (Despacho, Pedido Portal, Factura B2B).
 *
 * Owner/Admin (permiso comodín '*') aprueban siempre — no hace falta listarlos,
 * igual que en RolesEspecificosGuard. Si la regla tiene la lista vacía, el
 * guard no restringe nada más allá del `@Permiso` del módulo.
 */
export const APROBACION_KEY = 'aprobacionProceso';
export const Aprobacion = (proceso: ProcesoAprobacion) => SetMetadata(APROBACION_KEY, proceso);
