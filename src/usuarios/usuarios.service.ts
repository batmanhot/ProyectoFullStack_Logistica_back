import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { assertExists } from '../common/utils/assert-exists.util';

// passwordHash NUNCA se selecciona hacia afuera del service (sección 7 — seguridad).
const SELECT_PUBLICO = {
  id: true,
  nombre: true,
  email: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  rol: { select: { id: true, codigo: true, label: true } },
  area: { select: { id: true, nombre: true, codigo: true } }, // Fase 6
} as const;

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.usuario.findMany({
        where: { empresaId },
        select: SELECT_PUBLICO,
        orderBy: { nombre: 'asc' },
      }),
    );
  }

  async findOne(empresaId: string, id: string) {
    const usuario = await this.prisma.withTenant(empresaId, (tx) =>
      tx.usuario.findFirst({ where: { id, empresaId }, select: SELECT_PUBLICO }),
    );
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    return usuario;
  }

  async create(empresaId: string, dto: CreateUsuarioDto) {
    await this.validarRol(empresaId, dto.rolId);
    if (dto.areaId) await this.validarArea(empresaId, dto.areaId);
    const passwordHash = await bcrypt.hash(dto.password, 12);

    try {
      return await this.prisma.withTenant(empresaId, (tx) =>
        tx.usuario.create({
          data: {
            empresaId,
            nombre: dto.nombre,
            email: dto.email,
            passwordHash,
            rolId: dto.rolId,
            areaId: dto.areaId,
          },
          select: SELECT_PUBLICO,
        }),
      );
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException('Ya existe un usuario con ese email en esta empresa');
      }
      throw e;
    }
  }

  async update(empresaId: string, id: string, dto: UpdateUsuarioDto) {
    await this.findOne(empresaId, id); // lanza 404 si no existe / no pertenece al tenant

    if (dto.rolId) {
      await this.validarRol(empresaId, dto.rolId);
    }
    if (dto.areaId) {
      await this.validarArea(empresaId, dto.areaId);
    }

    const data: Record<string, unknown> = {
      ...(dto.nombre !== undefined && { nombre: dto.nombre }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.rolId !== undefined && { rolId: dto.rolId }),
      ...(dto.activo !== undefined && { activo: dto.activo }),
      ...(dto.areaId !== undefined && { areaId: dto.areaId }),
    };

    // password solo se actualiza si se envía explícitamente (sección 5 — Usuario).
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 12);
    }

    try {
      return await this.prisma.withTenant(empresaId, (tx) =>
        tx.usuario.update({ where: { id }, data, select: SELECT_PUBLICO }),
      );
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException('Ya existe un usuario con ese email en esta empresa');
      }
      throw e;
    }
  }

  async remove(empresaId: string, id: string) {
    await this.findOne(empresaId, id);
    await this.prisma.withTenant(empresaId, (tx) => tx.usuario.delete({ where: { id } }));
    return { id, eliminado: true };
  }

  /**
   * Reglas de negocio — Usuario (sección 5): "rol debe estar entre los roles
   * válidos del tenant (catálogo base + custom)".
   *
   * Hallazgo Crítico #3 (auditoría 2026-07-29): esto dependía SOLO de la
   * política RLS de "roles" (empresaId IS NULL O = tenant), asumiendo que
   * Postgres filtraría un rolId de otro tenant. Esa asunción era falsa — la
   * app corría con un rol de conexión que ignora RLS (ver Hallazgo Crítico
   * #1) — así que un admin podía asignar a un usuario el rolId de OTRA
   * empresa (incluyendo uno con permiso comodín '*') y escalar privilegios.
   * Ahora se filtra explícitamente en el WHERE, sin depender de RLS.
   */
  private validarRol(empresaId: string, rolId: string) {
    return assertExists(
      () =>
        this.prisma.withTenant(empresaId, (tx) =>
          tx.rol.findFirst({ where: { id: rolId, OR: [{ empresaId }, { empresaId: null }] } }),
        ),
      'El rol indicado no existe o no pertenece a esta empresa',
    );
  }

  /** Fase 6. */
  private validarArea(empresaId: string, areaId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.areaInterna.findFirst({ where: { id: areaId, empresaId } })),
      'El área indicada no existe o no pertenece a esta empresa',
    );
  }
}
