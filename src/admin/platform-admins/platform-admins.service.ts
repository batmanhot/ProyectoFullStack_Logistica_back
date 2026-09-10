import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { relanzarP2002 } from '../../common/utils/prisma-error.util';
import { CreatePlatformAdminDto } from './dto/create-platform-admin.dto';
import { UpdatePlatformAdminDto } from './dto/update-platform-admin.dto';

/** Regla de gobierno: como máximo 2 PlatformAdmin (SuperAdmin) registrados en toda la plataforma. */
const MAX_PLATFORM_ADMINS = 2;

const SELECT_PUBLICO = { id: true, nombre: true, email: true, activo: true, esNativo: true, createdAt: true };

@Injectable()
export class PlatformAdminsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.platformAdmin.findMany({
      select: SELECT_PUBLICO,
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(dto: CreatePlatformAdminDto) {
    const total = await this.prisma.platformAdmin.count();
    if (total >= MAX_PLATFORM_ADMINS) {
      throw new ForbiddenException(`Ya existen ${MAX_PLATFORM_ADMINS} administradores de plataforma — es el máximo permitido.`);
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      return await this.prisma.platformAdmin.create({
        data: { nombre: dto.nombre, email: dto.email, passwordHash }, // esNativo = false (default): solo la cuenta del seed es nativa
        select: SELECT_PUBLICO,
      });
    } catch (e) {
      relanzarP2002(e, { email: 'Ya existe un administrador de plataforma con ese email' });
    }
  }

  /** Actor + target de una acción sobre otra cuenta. Lanza 404 si el target no existe. */
  private async cargarActorYTarget(id: string, actorId: string) {
    const [target, actor] = await Promise.all([
      this.prisma.platformAdmin.findUnique({ where: { id } }),
      this.prisma.platformAdmin.findUnique({ where: { id: actorId }, select: { esNativo: true } }),
    ]);
    if (!target) throw new NotFoundException('Administrador de plataforma no encontrado');
    return { target, actorEsNativo: !!actor?.esNativo };
  }

  /**
   * Reglas de seguridad del CRUD (docs/GOBIERNO-PLATAFORMA.md regla 2):
   *  - El SuperAdmin NATIVO es la cuenta de mayor nivel: puede editar y eliminar
   *    a cualquier otro administrador (no-nativo).
   *  - Un admin no-nativo solo edita su propia cuenta; nunca toca a la nativa.
   *  - El email de la cuenta nativa nunca se cambia (es el ancla del upsert del
   *    seed / bootstrap-render).
   *  - `activo=false`: no sobre tu propia cuenta, no sobre la nativa, y debe
   *    quedar al menos un admin activo.
   */
  async update(id: string, dto: UpdatePlatformAdminDto, actorId: string) {
    const { target, actorEsNativo } = await this.cargarActorYTarget(id, actorId);

    const esPropio = id === actorId;
    const cambiaIdentidad = dto.nombre !== undefined || dto.email !== undefined;
    const cambiaPassword = dto.password !== undefined && dto.password !== '';

    // Editar identidad/contraseña de OTRA cuenta: solo el nativo, y solo sobre no-nativos.
    if ((cambiaIdentidad || cambiaPassword) && !esPropio && !(actorEsNativo && !target.esNativo)) {
      throw new ForbiddenException(
        'Solo puedes editar tu propia cuenta. El administrador nativo puede, además, editar a cualquier otro administrador.',
      );
    }

    if (dto.email !== undefined && target.esNativo) {
      throw new ForbiddenException('El email de la cuenta nativa de la plataforma no se puede cambiar.');
    }

    if (dto.activo === false) {
      if (esPropio) {
        throw new ForbiddenException('No puedes desactivar tu propia cuenta');
      }
      if (target.esNativo) {
        throw new ForbiddenException('La cuenta nativa de la plataforma no se puede desactivar');
      }
      const activos = await this.prisma.platformAdmin.count({ where: { activo: true } });
      if (activos <= 1) {
        throw new ForbiddenException('Debe quedar al menos un administrador de plataforma activo');
      }
    }

    const data: Record<string, unknown> = {};
    if (dto.nombre !== undefined) data.nombre = dto.nombre;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.activo !== undefined) data.activo = dto.activo;
    if (cambiaPassword) data.passwordHash = await bcrypt.hash(dto.password as string, 12);

    try {
      return await this.prisma.platformAdmin.update({
        where: { id },
        data,
        select: SELECT_PUBLICO,
      });
    } catch (e) {
      relanzarP2002(e, { email: 'Ya existe un administrador de plataforma con ese email' });
    }
  }

  /**
   * Hard delete — solo el SuperAdmin NATIVO, y nunca sobre la cuenta nativa.
   * Libera el slot (máx. 2) y el email para registrar a otra persona. La
   * auditoría del eliminado se conserva (adminId → NULL, adminEmail queda).
   */
  async remove(id: string, actorId: string) {
    const { target, actorEsNativo } = await this.cargarActorYTarget(id, actorId);
    if (!actorEsNativo) {
      throw new ForbiddenException('Solo el administrador nativo de la plataforma puede eliminar administradores.');
    }
    if (target.esNativo) {
      throw new ForbiddenException('La cuenta nativa de la plataforma no se puede eliminar.');
    }
    await this.prisma.platformAdmin.delete({ where: { id } });
    return { id, eliminado: true };
  }
}
