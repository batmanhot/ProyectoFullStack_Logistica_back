import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISO_KEY } from '../decorators/permiso.decorator';
import { RolesService } from '../../roles/roles.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISO_A_GRUPO_PLAN } from '../permiso-plan-map';

/**
 * Corre después de JwtAuthGuard (AuthModule se importa antes que RolesModule
 * en app.module.ts) — necesita request.user ya poblado.
 *
 * Sin @Permiso() en la ruta/controller ⇒ sin restricción. Es el rollout
 * incremental acordado: solo los controllers explícitamente decorados quedan
 * gateados (ver plan de Fase 3), el resto sigue como hoy.
 *
 * Fase 3b: además del permiso de Rol, cruza contra Empresa.plan.modulosIncluidos
 * — salvo que el permiso haya matcheado por '*' (Owner/Admin bypasean el plan
 * también), o el módulo no tenga grupo de plan asociado (administración
 * interna), o el plan de la empresa no resuelva (fail-open, mismo criterio
 * que usePlanLimits desde la Fase 0).
 */
@Injectable()
export class PermisosGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rolesService: RolesService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const modulo = this.reflector.getAllAndOverride<string>(PERMISO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!modulo) return true;

    const { empresaId, rolId } = context.switchToHttp().getRequest().user ?? {};
    if (!empresaId || !rolId) return false;

    const { permitido, viaComodin } = await this.rolesService.verificarPermiso(empresaId, rolId, modulo);
    if (!permitido) return false;
    if (viaComodin) return true;

    const grupo = PERMISO_A_GRUPO_PLAN[modulo];
    if (!grupo) return true;

    const empresa = await this.prisma.empresa.findUnique({ where: { id: empresaId }, select: { plan: true } });
    const plan = empresa?.plan
      ? await this.prisma.planSaaS.findUnique({ where: { id: empresa.plan }, select: { modulosIncluidos: true } })
      : null;
    if (!plan) return true;

    return plan.modulosIncluidos.includes(grupo);
  }
}
