import { SetMetadata } from '@nestjs/common';

/**
 * Auditoría 2026-09-04: el permiso de módulo (ej. 'almacenes') es todo-o-nada
 * — no distingue "puede ver/operar" de "puede crear/editar/eliminar el
 * catálogo maestro completo". Este marcador, leído por RolesEspecificosGuard,
 * exige además que el rol del usuario esté en la lista dada (los roles con
 * permiso comodín '*' — Owner/Admin — siempre pasan, sin necesidad de
 * listarlos). Se aplica a nivel de handler puntual, nunca de controller, así
 * el resto del CRUD sigue abierto a quien ya tenía el permiso de módulo.
 *
 * Reemplaza al `@SoloGestion()` original (2026-09-04, mismo día): ese caso
 * (Clientes/Proveedores/Productos → eliminar solo Owner/Admin/Gerente de
 * Operaciones) es simplemente `@SoloRoles('gerente-operaciones')`.
 */
export const SOLO_ROLES_KEY = 'soloRoles';
export const SoloRoles = (...codigos: string[]) => SetMetadata(SOLO_ROLES_KEY, codigos);
