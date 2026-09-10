import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProcesoAprobacion } from '@prisma/client';
import { APROBACION_KEY } from '../decorators/aprobacion.decorator';
import { ROLES_APROBACION_POR_DEFECTO } from '../aprobacion-procesos';
import { PrismaService } from '../../prisma/prisma.service';

const NOMBRES_ROL: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  'gerente-operaciones': 'Gerente de Operaciones',
  supervisor: 'Supervisor de Almacén',
  almacenero: 'Almacenero',
  despachador: 'Despachador',
  'coordinador-transporte': 'Coordinador de Transporte',
  'analista-compras': 'Analista de Compras',
  'ejecutivo-comercial': 'Ejecutivo Comercial',
  'contable-finanzas': 'Contabilidad y Finanzas',
  auditor: 'Auditor',
};

/**
 * MEJORAS-DIFERIDAS #11b — autoridad de aprobación configurable por proceso.
 *
 * Corre después de PermisosGuard / RolesEspecificosGuard (mismo APP_GUARD en
 * roles.module.ts) — necesita request.user poblado. Solo actúa donde el
 * handler lleva `@Aprobacion(proceso)`.
 *
 * Regla: `ReglaAprobacion(empresaId, proceso).rolesAprobadores`.
 *   · sin fila (empresa creada antes del backfill) → fallback al valor por
 *     defecto del proceso (ROLES_APROBACION_POR_DEFECTO) — nunca indefinido.
 *   · lista vacía → no restringe (basta el @Permiso del módulo).
 *   · rol con permiso '*' (Owner/Admin) → siempre aprueba.
 *   · si no, el `codigo` del rol debe estar en la lista.
 */
@Injectable()
export class AprobacionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const proceso = this.reflector.getAllAndOverride<ProcesoAprobacion>(APROBACION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!proceso) return true;

    const { empresaId, rolId } = context.switchToHttp().getRequest().user ?? {};
    if (!empresaId || !rolId) return false;

    const [regla, rol] = await this.prisma.withTenant(empresaId, (tx) =>
      Promise.all([
        tx.reglaAprobacion.findUnique({ where: { empresaId_proceso: { empresaId, proceso } } }),
        tx.rol.findFirst({
          where: { id: rolId, OR: [{ empresaId }, { empresaId: null }] },
          include: { permisos: { select: { modulo: true } } },
        }),
      ]),
    );
    if (!rol) return false;

    const rolesAprobadores = regla?.rolesAprobadores ?? ROLES_APROBACION_POR_DEFECTO[proceso] ?? [];
    if (rolesAprobadores.length === 0) return true;

    const esComodin = rol.permisos.some((p) => p.modulo === '*');
    if (esComodin || rolesAprobadores.includes(rol.codigo)) return true;

    const nombres = ['Propietario', 'Administrador', ...rolesAprobadores.map((c) => NOMBRES_ROL[c] || c)];
    throw new ForbiddenException(
      `Esta aprobación está restringida a: ${[...new Set(nombres)].join(', ')}. ` +
        'Se configura en Configuración → Aprobaciones.',
    );
  }
}
