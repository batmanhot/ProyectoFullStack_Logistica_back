import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SOLO_ROLES_KEY } from '../decorators/solo-roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';

const NOMBRES_ROL: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  'gerente-operaciones': 'Gerente de Operaciones',
  supervisor: 'Supervisor de Almacén',
  'coordinador-transporte': 'Coordinador de Transporte',
};

/**
 * Corre después de PermisosGuard (mismo orden de app.module.ts) — necesita
 * request.user ya poblado. No reemplaza al permiso de módulo: es una
 * segunda capa que solo actúa donde un handler puntual lleva @SoloRoles(...)
 * (ver decorator). Un rol con permiso comodín ('*' — Owner/Admin) siempre
 * pasa, sin importar la lista.
 */
@Injectable()
export class RolesEspecificosGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rolesPermitidos = this.reflector.getAllAndOverride<string[]>(SOLO_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rolesPermitidos || rolesPermitidos.length === 0) return true;

    const { empresaId, rolId } = context.switchToHttp().getRequest().user ?? {};
    if (!empresaId || !rolId) return false;

    const rol = await this.prisma.withTenant(empresaId, (tx) =>
      tx.rol.findFirst({
        where: { id: rolId, OR: [{ empresaId }, { empresaId: null }] },
        include: { permisos: { select: { modulo: true } } },
      }),
    );
    if (!rol) return false;

    const esComodin = rol.permisos.some((p) => p.modulo === '*');
    if (esComodin || rolesPermitidos.includes(rol.codigo)) return true;

    const nombres = ['Propietario', 'Administrador', ...rolesPermitidos.map((c) => NOMBRES_ROL[c] || c)];
    throw new ForbiddenException(`Esta acción está restringida a: ${[...new Set(nombres)].join(', ')}`);
  }
}
