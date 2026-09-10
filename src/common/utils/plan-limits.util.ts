import { ForbiddenException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

// Acepta tanto el PrismaClient como un `tx` de $transaction (ambos exponen estos delegates).
type ClienteConDelegates = Pick<PrismaClient, 'empresa' | 'planSaaS' | 'usuario'>;

/**
 * Regla de gobierno (docs/GOBIERNO-PLATAFORMA.md regla 3 / regla 5): cada cuenta
 * de usuario ACTIVA ocupa un cupo del plan (`PlanSaaS.maxUsuarios`; -1 = ilimitado).
 * Las cuentas inactivas no consumen cupo. Owner y Admin del Negocio cuentan igual
 * que el resto.
 *
 * Verifica que agregar `delta` cuentas activas no supere el límite. `tx` debe
 * estar en el contexto del tenant (withTenant / activarTenantEnTransaccion) —
 * `empresas` y `planes_saas` no tienen RLS, `usuarios` sí.
 */
export async function assertCuposUsuarioDisponibles(
  tx: ClienteConDelegates,
  empresaId: string,
  delta = 1,
): Promise<void> {
  if (delta <= 0) return;
  const empresa = await tx.empresa.findUnique({ where: { id: empresaId }, select: { plan: true } });
  const plan = empresa?.plan
    ? await tx.planSaaS.findUnique({ where: { id: empresa.plan }, select: { maxUsuarios: true } })
    : null;
  const max = plan?.maxUsuarios ?? -1;
  if (max === -1) return; // ilimitado

  const activos = await tx.usuario.count({ where: { empresaId, activo: true } });
  if (activos + delta > max) {
    const detalle = delta === 1 ? '' : ` (se intentan agregar ${delta})`;
    throw new ForbiddenException(
      `El plan permite hasta ${max} cuenta(s) activa(s) y ya hay ${activos}${detalle}. Desactiva otra cuenta o sube de plan.`,
    );
  }
}
