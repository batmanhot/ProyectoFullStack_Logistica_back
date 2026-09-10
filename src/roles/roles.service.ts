import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * SOLO LECTURA desde el tenant (2026-09-10). Crear / editar / eliminar roles
 * —base y propios del negocio— se hace únicamente desde el panel SuperAdmin
 * (`AdminRolesBaseService`, `/admin/roles-base`). Aquí solo se listan para
 * asignarlos a usuarios y se resuelve `verificarPermiso` para los guards.
 */
@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * SOLO el catálogo del SuperAdmin (`empresaId null`). El negocio nunca ve
   * (ni tiene) roles propios: todo el catálogo se gobierna desde
   * `/admin/roles-base`. Si un tenant arrastrara un rol `esPersonalizado`
   * de antes de este corte, no aparece aquí — sigue funcionando para los
   * usuarios ya asignados (`verificarPermiso` resuelve por `rolId`) hasta
   * que el SuperAdmin lo migre.
   */
  findAll(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.rol.findMany({
        where: { empresaId: null },
        include: { permisos: { select: { modulo: true } } },
        orderBy: [{ label: 'asc' }],
      }),
    );
  }

  /**
   * Hallazgo Crítico #2 (auditoría 2026-07-29): antes usaba findUnique({where:{id}})
   * sin empresaId, confiando solo en la política RLS (ver Hallazgo Crítico #1 —
   * esa confianza era falsa, la app corría con un rol que ignora RLS). Ahora se
   * filtra explícitamente: catálogo base (empresaId null) + roles propios del tenant,
   * igual que hace la query — nunca un rol de OTRO tenant.
   */
  async findOne(empresaId: string, id: string) {
    const rol = await this.prisma.withTenant(empresaId, (tx) =>
      tx.rol.findFirst({
        where: { id, OR: [{ empresaId }, { empresaId: null }] },
        include: { permisos: { select: { modulo: true } } },
      }),
    );
    if (!rol) throw new NotFoundException('Rol no encontrado');
    return rol;
  }

  /**
   * GET /api/permisos/verificar — replica tienePermiso(rol, modulo) de storage.js.
   * `viaComodin` se usa internamente por PermisosGuard (Fase 3b) para saber si
   * debe además cruzar contra el plan — Owner/Admin ('*') bypasean ese cruce.
   */
  async verificarPermiso(empresaId: string, rolId: string, modulo: string) {
    if (!rolId || !modulo) {
      throw new BadRequestException('rolId y modulo son obligatorios');
    }
    // Hallazgo Crítico #3 (auditoría 2026-07-29): sin el filtro empresaId/null
    // acá, un usuario con un rolId de OTRO tenant (obtenido vía el hallazgo #2,
    // por ejemplo) podía heredar los permisos de ese rol ajeno.
    const rol = await this.prisma.withTenant(empresaId, (tx) =>
      tx.rol.findFirst({
        where: { id: rolId, OR: [{ empresaId }, { empresaId: null }] },
        include: { permisos: true },
      }),
    );
    if (!rol) {
      throw new BadRequestException('Rol no encontrado o no pertenece a esta empresa');
    }
    const viaComodin = rol.permisos.some((p) => p.modulo === '*');
    const permitido = viaComodin || rol.permisos.some((p) => p.modulo === modulo);
    return { permitido, viaComodin };
  }
}
