import { ProcesoAprobacion } from '@prisma/client';

/**
 * Fuente de verdad de los procesos con aprobación configurable (#11b) y su
 * valor POR DEFECTO — el que reproduce el comportamiento previo al feature:
 *
 *   · PEDIDO_INTERNO → lo que exigía el `@SoloRoles` hardcodeado.
 *   · el resto → [] : hoy basta el permiso de módulo (`@Permiso(...)`), no hay
 *     restricción extra de rol.
 *
 * Lo usan: el seed / `sembrarReglasAprobacion` (bases nuevas), el
 * AprobacionesService (rellena procesos sin fila) y AprobacionGuard (fallback
 * si la fila no existe todavía). Owner/Admin ('*') aprueban siempre, aparte.
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
    rolesPorDefecto: ['supervisor', 'gerente-operaciones'],
  },
  {
    proceso: 'DESPACHO',
    label: 'Despacho',
    descripcion: 'Aprobar un despacho para que pase a picking (PEDIDO → APROBADO).',
    rolesPorDefecto: [],
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
