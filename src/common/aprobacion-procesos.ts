import { ProcesoAprobacion } from '@prisma/client';

/**
 * Fuente de verdad de los procesos con aprobación configurable (#11b) y su
 * valor POR DEFECTO — el que reproduce el comportamiento previo al feature:
 *
 *   · PEDIDO_INTERNO → lo que exigía el `@SoloRoles` hardcodeado.
 *   · DESPACHO → mismo trío que PEDIDO_INTERNO desde 2026-09-12 (ver nota
 *     abajo) — antes vacío, ahora con separación de funciones real.
 *   · el resto → [] : hoy basta el permiso de módulo (`@Permiso(...)`), no hay
 *     restricción extra de rol.
 *
 * Lo usan: el seed / `sembrarReglasAprobacion` (bases nuevas), el
 * AprobacionesService (rellena procesos sin fila) y AprobacionGuard (fallback
 * si la fila no existe todavía). Owner ('*') aprueba siempre, aparte — Admin
 * YA NO (Alcance de roles, 2026-09-11: dejó de tener '*'), por eso figura
 * explícito en PEDIDO_INTERNO y DESPACHO abajo.
 *
 * DESPACHO (2026-09-12): el usuario probando con Almacenero notó que podía
 * crear Y aprobar su propio despacho — el default vacío de antes dejaba
 * "basta el permiso de módulo" como única barrera, vaciando en la práctica
 * el sentido del permiso angosto 'despachos-aprobar' (Admin/Gerente de
 * Operaciones supervisan sin operar). Se cambió el default a
 * ['admin','supervisor','gerente-operaciones'] — pero por decisión
 * explícita del usuario esto SOLO aplica a negocios nuevos (vía
 * `sembrarReglasAprobacion` al alta); los negocios ya existentes conservan
 * su fila actual (`[]` si nunca la tocaron) y se configuran a mano desde
 * Configuración → Aprobaciones, sin migración de backfill.
 */
export interface ProcesoAprobacionMeta {
  proceso: ProcesoAprobacion;
  label: string;
  descripcion: string;
  rolesPorDefecto: string[];
}

export const PROCESOS_APROBACION: ProcesoAprobacionMeta[] = [
  {
    proceso: 'PEDIDO_INTERNO',
    label: 'Pedido Interno',
    descripcion: 'Aprobar o rechazar un pedido interno enviado (ENVIADO → APROBADO).',
    rolesPorDefecto: ['admin', 'supervisor', 'gerente-operaciones'],
  },
  {
    proceso: 'DESPACHO',
    label: 'Despacho',
    descripcion: 'Aprobar un despacho para que pase a picking (PEDIDO → APROBADO).',
    // 2026-09-12: antes vacío ("basta el permiso de módulo") — un negocio
    // que nunca tocara esta pantalla dejaba a Almacenero/Despachador
    // autoaprobar su propio pedido (crea Y aprueba, sin separación de
    // funciones), justo lo que el permiso angosto 'despachos-aprobar' de
    // Admin/Gerente de Operaciones existe para evitar. Mismo trío que
    // Pedido Interno. Solo rige para negocios NUEVOS (sembrarReglasAprobacion
    // al alta) — decisión explícita del usuario de no retro-aplicarlo a
    // negocios ya existentes vía migración; ahí se configura a mano desde
    // Configuración → Aprobaciones.
    rolesPorDefecto: ['admin', 'supervisor', 'gerente-operaciones'],
  },
  {
    proceso: 'PEDIDO_PORTAL',
    label: 'Pedido del Portal B2B',
    descripcion: 'Aprobar (convierte en despacho) o rechazar un pedido hecho por un cliente en el portal.',
    rolesPorDefecto: [],
  },
  {
    proceso: 'FACTURA_B2B',
    label: 'Factura de proveedor (B2B)',
    descripcion: 'Rechazar una factura de proveedor recibida.',
    rolesPorDefecto: [],
  },
  {
    proceso: 'INVENTARIO_FISICO',
    label: 'Inventario Físico',
    descripcion: 'Cerrar un conteo físico — genera los Movimientos AJUSTE reales por cada diferencia.',
    rolesPorDefecto: [],
  },
  {
    proceso: 'PROFORMA',
    label: 'Proforma de venta',
    descripcion: 'Aceptar una proforma enviada (la bloquea de edición y habilita convertirla en Despacho).',
    rolesPorDefecto: [],
  },
];

export const PROCESO_APROBACION_VALUES: ProcesoAprobacion[] = PROCESOS_APROBACION.map((p) => p.proceso);

export const ROLES_APROBACION_POR_DEFECTO: Record<ProcesoAprobacion, string[]> = Object.fromEntries(
  PROCESOS_APROBACION.map((p) => [p.proceso, p.rolesPorDefecto]),
) as Record<ProcesoAprobacion, string[]>;

/**
 * Siembra las 4 reglas de una empresa con su valor por defecto, idempotente.
 * Se llama desde `prisma/seed.ts` y desde el alta de negocio del SuperAdmin
 * (`negocios.service.create`) para que toda empresa nazca con sus reglas — la
 * migración `20260910161424_reglas_aprobacion` cubre las que ya existían.
 * Recibe un delegate Prisma (cliente o `tx`) para que sirva dentro de una
 * transacción.
 */
export async function sembrarReglasAprobacion(
  db: { reglaAprobacion: { createMany: (args: any) => Promise<unknown> } },
  empresaId: string,
): Promise<void> {
  await db.reglaAprobacion.createMany({
    data: PROCESOS_APROBACION.map((p) => ({
      empresaId,
      proceso: p.proceso,
      rolesAprobadores: p.rolesPorDefecto,
    })),
    skipDuplicates: true,
  });
}
