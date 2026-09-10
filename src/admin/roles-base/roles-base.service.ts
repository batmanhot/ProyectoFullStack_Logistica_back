import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { relanzarP2002 } from '../../common/utils/prisma-error.util';
import { CreateAdminRolDto } from './dto/create-admin-rol.dto';
import { UpdateAdminRolDto } from './dto/update-admin-rol.dto';

/**
 * Catálogo BASE de roles (Rol.empresaId = null) — las plantillas que hoy
 * solo se podían tocar editando prisma/seed.ts a mano. El lado tenant
 * (src/roles/roles.service.ts) explícitamente bloquea editar/eliminar estos
 * roles ("intocables vía API" desde un tenant) — este módulo es la ÚNICA
 * vía real para gobernarlos, reservada al PlatformAdmin (regla de negocio
 * 2026-09-04: "el SuperAdmin es responsable de administrar Roles y
 * Permisos"). No reintroduce el modelo de permisos granular (acción×módulo)
 * que ya se descartó — sigue siendo todo-o-nada por módulo, igual que hoy.
 */
@Injectable()
export class RolesBaseService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `owner` y `admin` son la columna vertebral del gobierno multi-tenant
   * (regla 3 de docs/GOBIERNO-PLATAFORMA.md): todo negocio tiene un Propietario
   * y opcionalmente un Admin, ambos con acceso total. No se pueden eliminar
   * ni se les puede recortar permisos — el `PermisosGuard` los trata como
   * comodín (`*`). El label/descripcion sí son editables (son solo texto de UI).
   */
  private static readonly PROTEGIDOS = new Set(['owner', 'admin']);

  async findAll() {
    const roles = await this.prisma.rol.findMany({
      where: { empresaId: null },
      include: { permisos: { select: { modulo: true } } },
      orderBy: { label: 'asc' },
    });
    const uso = await this.contarUso(roles.map((r) => r.id));
    return roles.map((r) => ({
      ...r,
      protegido: RolesBaseService.PROTEGIDOS.has(r.codigo),
      enUso: uso[r.id] ?? { usuarios: 0, negocios: 0 },
    }));
  }

  async findOne(id: string) {
    const rol = await this.prisma.rol.findFirst({
      where: { id, empresaId: null },
      include: { permisos: { select: { modulo: true } } },
    });
    if (!rol) throw new NotFoundException('Rol base no encontrado');
    const uso = await this.contarUso([rol.id]);
    return {
      ...rol,
      protegido: RolesBaseService.PROTEGIDOS.has(rol.codigo),
      enUso: uso[rol.id] ?? { usuarios: 0, negocios: 0 },
    };
  }

  async create(dto: CreateAdminRolDto) {
    if (RolesBaseService.PROTEGIDOS.has(dto.codigo)) {
      throw new ConflictException(`El código "${dto.codigo}" está reservado por la plataforma.`);
    }
    try {
      return await this.prisma.rol.create({
        data: {
          empresaId: null,
          codigo: dto.codigo,
          label: dto.label,
          descripcion: dto.descripcion ?? null,
          esPersonalizado: false,
          permisos: { create: dto.permisos.map((modulo) => ({ modulo })) },
        },
        include: { permisos: { select: { modulo: true } } },
      });
    } catch (e) {
      relanzarP2002(e, { codigo: 'Ya existe un rol base con ese código' });
    }
  }

  async update(id: string, dto: UpdateAdminRolDto) {
    const actual = await this.findOne(id);

    // owner/admin: solo texto de UI, nunca permisos (su acceso total es intocable).
    if (actual.protegido && dto.permisos !== undefined) {
      throw new ForbiddenException(
        `Los permisos de "${actual.codigo}" no se pueden modificar — es un rol de gobierno con acceso total.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.permisos) {
        await tx.permiso.deleteMany({ where: { rolId: id } });
      }
      return tx.rol.update({
        where: { id },
        data: {
          ...(dto.label !== undefined && { label: dto.label }),
          ...(dto.descripcion !== undefined && { descripcion: dto.descripcion || null }),
          ...(dto.permisos !== undefined && { permisos: { create: dto.permisos.map((modulo) => ({ modulo })) } }),
        },
        include: { permisos: { select: { modulo: true } } },
      });
    });
  }

  async remove(id: string) {
    const rol = await this.findOne(id);
    if (rol.protegido) {
      throw new ForbiddenException(
        `"${rol.codigo}" es un rol de gobierno de la plataforma y no se puede eliminar.`,
      );
    }
    const enUso = rol.enUso.usuarios;
    if (enUso > 0) {
      throw new ConflictException(
        `Este rol lo usan ${enUso} usuario(s) en ${rol.enUso.negocios} negocio(s) — no se puede eliminar mientras esté en uso.`,
      );
    }
    await this.prisma.rol.delete({ where: { id } });
    return { id, eliminado: true };
  }

  /**
   * Cuántos usuarios (y en cuántos negocios distintos) usan cada rol base.
   * Un `groupBy` por (rolId, empresaId) resuelve ambas cifras de una: sumar
   * `_count` da los usuarios, contar las filas da los negocios distintos.
   */
  private async contarUso(
    rolIds: string[],
  ): Promise<Record<string, { usuarios: number; negocios: number }>> {
    if (rolIds.length === 0) return {};
    const filas = await this.prisma.usuario.groupBy({
      by: ['rolId', 'empresaId'],
      where: { rolId: { in: rolIds } },
      _count: true,
    });
    const acc: Record<string, { usuarios: number; negocios: number }> = {};
    for (const f of filas) {
      if (!f.rolId) continue;
      const e = (acc[f.rolId] ??= { usuarios: 0, negocios: 0 });
      e.usuarios += f._count;
      e.negocios += 1;
    }
    return acc;
  }
}
