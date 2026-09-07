import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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

  findAll() {
    return this.prisma.rol.findMany({
      where: { empresaId: null },
      include: { permisos: { select: { modulo: true } } },
      orderBy: { label: 'asc' },
    });
  }

  async findOne(id: string) {
    const rol = await this.prisma.rol.findFirst({
      where: { id, empresaId: null },
      include: { permisos: { select: { modulo: true } } },
    });
    if (!rol) throw new NotFoundException('Rol base no encontrado');
    return rol;
  }

  async create(dto: CreateAdminRolDto) {
    try {
      return await this.prisma.rol.create({
        data: {
          empresaId: null,
          codigo: dto.codigo,
          label: dto.label,
          esPersonalizado: false,
          permisos: { create: dto.permisos.map((modulo) => ({ modulo })) },
        },
        include: { permisos: { select: { modulo: true } } },
      });
    } catch (e: any) {
      if (e.code === 'P2002') throw new BadRequestException('Ya existe un rol base con ese código');
      throw e;
    }
  }

  async update(id: string, dto: UpdateAdminRolDto) {
    await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      if (dto.permisos) {
        await tx.permiso.deleteMany({ where: { rolId: id } });
      }
      return tx.rol.update({
        where: { id },
        data: {
          ...(dto.label !== undefined && { label: dto.label }),
          ...(dto.permisos !== undefined && { permisos: { create: dto.permisos.map((modulo) => ({ modulo })) } }),
        },
        include: { permisos: { select: { modulo: true } } },
      });
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    const enUso = await this.prisma.usuario.count({ where: { rolId: id } });
    if (enUso > 0) {
      throw new ConflictException(
        `Este rol lo usan ${enUso} usuario(s) en uno o más negocios — no se puede eliminar mientras esté en uso.`,
      );
    }
    await this.prisma.rol.delete({ where: { id } });
    return { id, eliminado: true };
  }
}
