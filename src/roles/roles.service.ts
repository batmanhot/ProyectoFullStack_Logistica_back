import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRolDto } from './dto/create-rol.dto';
import { UpdateRolDto } from './dto/update-rol.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * La política RLS de "roles" ya filtra: catálogo base (empresaId null)
   * + roles personalizados de este tenant. No se necesita un OR explícito
   * aquí — es exactamente la garantía que pide el hallazgo #4.
   */
  findAll(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.rol.findMany({
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

  async create(empresaId: string, dto: CreateRolDto) {
    try {
      return await this.prisma.withTenant(empresaId, (tx) =>
        tx.rol.create({
          data: {
            empresaId,
            codigo: dto.codigo,
            label: dto.label,
            esPersonalizado: true,
            permisos: { create: dto.permisos.map((modulo) => ({ modulo })) },
          },
          include: { permisos: { select: { modulo: true } } },
        }),
      );
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException('Ya existe un rol con ese código en esta empresa');
      }
      throw e;
    }
  }

  async update(empresaId: string, id: string, dto: UpdateRolDto) {
    const rol = await this.findOne(empresaId, id);
    this.asegurarRolPropio(rol, empresaId);

    return this.prisma.withTenant(empresaId, async (tx) => {
      if (dto.permisos) {
        await tx.permiso.deleteMany({ where: { rolId: id } });
      }
      return tx.rol.update({
        where: { id },
        data: {
          ...(dto.label !== undefined && { label: dto.label }),
          ...(dto.permisos !== undefined && {
            permisos: { create: dto.permisos.map((modulo) => ({ modulo })) },
          }),
        },
        include: { permisos: { select: { modulo: true } } },
      });
    });
  }

  async remove(empresaId: string, id: string) {
    const rol = await this.findOne(empresaId, id);
    this.asegurarRolPropio(rol, empresaId);
    await this.prisma.withTenant(empresaId, (tx) => tx.rol.delete({ where: { id } }));
    return { id, eliminado: true };
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

  /** El catálogo base (empresaId null) y los roles de otro tenant son intocables vía API. */
  private asegurarRolPropio(rol: { empresaId: string | null }, empresaId: string) {
    if (rol.empresaId !== empresaId) {
      throw new ForbiddenException(
        'No se puede modificar ni eliminar un rol del catálogo base',
      );
    }
  }
}
