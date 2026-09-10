import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { assertExists } from '../common/utils/assert-exists.util';
import { assertCuposUsuarioDisponibles } from '../common/utils/plan-limits.util';

// Regla de gobierno de plataforma (docs/GOBIERNO-PLATAFORMA.md, regla 3):
// los usuarios Propietario (owner) y Administrador del Negocio (admin) los
// registra y gestiona ÚNICAMENTE el SuperAdmin (vía /admin/negocios). El
// tenant no puede crearlos, editarlos, cambiarles el rol ni eliminarlos.
const ROLES_GESTIONADOS_POR_PLATAFORMA = ['owner', 'admin'];
const MSG_ROL_PLATAFORMA =
  'Los usuarios Propietario y Administrador del Negocio los gestiona el administrador de la plataforma, no se editan desde aquí.';
const esRolDePlataforma = (codigo: string | undefined | null): boolean =>
  !!codigo && ROLES_GESTIONADOS_POR_PLATAFORMA.includes(codigo);

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
  transportista: { select: { id: true, nombre: true, placa: true } }, // Fase 3 vista móvil
  metaVentasMensual: true, // Fase 10 Gestión Comercial
  telefono: true, documento: true, cargo: true, // datos de perfil (2026-09-09)
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
    const rol = await this.validarRol(empresaId, dto.rolId);
    if (esRolDePlataforma(rol?.codigo)) {
      throw new ForbiddenException(MSG_ROL_PLATAFORMA);
    }
    if (dto.areaId) await this.validarArea(empresaId, dto.areaId);
    if (dto.transportistaId) await this.validarTransportista(empresaId, dto.transportistaId);
    const passwordHash = await bcrypt.hash(dto.password, 12);

    try {
      return await this.prisma.withTenant(empresaId, async (tx) => {
        // Regla 3/5: cada cuenta activa ocupa un cupo del plan. El alta crea la
        // cuenta activa, así que consume uno.
        await assertCuposUsuarioDisponibles(tx, empresaId, 1);
        return tx.usuario.create({
          data: {
            empresaId,
            nombre: dto.nombre,
            email: dto.email,
            passwordHash,
            rolId: dto.rolId,
            areaId: dto.areaId,
            transportistaId: dto.transportistaId,
            metaVentasMensual: dto.metaVentasMensual,
            telefono: dto.telefono,
            documento: dto.documento,
            cargo: dto.cargo,
          },
          select: SELECT_PUBLICO,
        });
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException('Ya existe un usuario con ese email en esta empresa');
      }
      throw e;
    }
  }

  async update(empresaId: string, id: string, dto: UpdateUsuarioDto) {
    const actual = await this.findOne(empresaId, id); // lanza 404 si no existe / no pertenece al tenant

    // No se puede tocar un usuario Propietario/Admin del Negocio desde el tenant…
    if (esRolDePlataforma(actual.rol?.codigo)) {
      throw new ForbiddenException(MSG_ROL_PLATAFORMA);
    }

    if (dto.rolId) {
      const rol = await this.validarRol(empresaId, dto.rolId);
      // …ni promover a uno hacia esos roles.
      if (esRolDePlataforma(rol?.codigo)) {
        throw new ForbiddenException(MSG_ROL_PLATAFORMA);
      }
    }
    if (dto.areaId) {
      await this.validarArea(empresaId, dto.areaId);
    }
    if (dto.transportistaId) {
      await this.validarTransportista(empresaId, dto.transportistaId);
    }

    const data: Record<string, unknown> = {
      ...(dto.nombre !== undefined && { nombre: dto.nombre }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.rolId !== undefined && { rolId: dto.rolId }),
      ...(dto.activo !== undefined && { activo: dto.activo }),
      ...(dto.areaId !== undefined && { areaId: dto.areaId }),
      ...(dto.transportistaId !== undefined && { transportistaId: dto.transportistaId }),
      ...(dto.metaVentasMensual !== undefined && { metaVentasMensual: dto.metaVentasMensual }),
      ...(dto.telefono !== undefined && { telefono: dto.telefono }),
      ...(dto.documento !== undefined && { documento: dto.documento }),
      ...(dto.cargo !== undefined && { cargo: dto.cargo }),
    };

    // password solo se actualiza si se envía explícitamente (sección 5 — Usuario).
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 12);
    }

    // Reactivar una cuenta también consume un cupo del plan.
    const reactivando = dto.activo === true && actual.activo === false;

    try {
      return await this.prisma.withTenant(empresaId, async (tx) => {
        if (reactivando) await assertCuposUsuarioDisponibles(tx, empresaId, 1);
        return tx.usuario.update({ where: { id }, data, select: SELECT_PUBLICO });
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException('Ya existe un usuario con ese email en esta empresa');
      }
      throw e;
    }
  }

  async remove(empresaId: string, id: string) {
    const actual = await this.findOne(empresaId, id);
    if (esRolDePlataforma(actual.rol?.codigo)) {
      throw new ForbiddenException(MSG_ROL_PLATAFORMA);
    }
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

  /** Fase 3 vista móvil (2026-08-05) — mismo criterio que validarArea. */
  private validarTransportista(empresaId: string, transportistaId: string) {
    return assertExists(
      () =>
        this.prisma.withTenant(empresaId, (tx) =>
          tx.transportista.findFirst({ where: { id: transportistaId, empresaId } }),
        ),
      'El transportista indicado no existe o no pertenece a esta empresa',
    );
  }
}
