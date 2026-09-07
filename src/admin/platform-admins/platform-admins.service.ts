import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePlatformAdminDto } from './dto/create-platform-admin.dto';
import { UpdatePlatformAdminDto } from './dto/update-platform-admin.dto';

/** Regla de gobierno: como máximo 2 PlatformAdmin (SuperAdmin) registrados en toda la plataforma. */
const MAX_PLATFORM_ADMINS = 2;

@Injectable()
export class PlatformAdminsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.platformAdmin.findMany({
      select: { id: true, nombre: true, email: true, activo: true, createdAt: true },
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
        data: { nombre: dto.nombre, email: dto.email, passwordHash },
        select: { id: true, nombre: true, email: true, activo: true, createdAt: true },
      });
    } catch (e: any) {
      if (e.code === 'P2002') throw new BadRequestException('Ya existe un administrador de plataforma con ese email');
      throw e;
    }
  }

  async update(id: string, dto: UpdatePlatformAdminDto, actorId: string) {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException('Administrador de plataforma no encontrado');

    if (dto.activo === false) {
      if (id === actorId) {
        throw new ForbiddenException('No puedes desactivar tu propia cuenta');
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
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 12);

    try {
      return await this.prisma.platformAdmin.update({
        where: { id },
        data,
        select: { id: true, nombre: true, email: true, activo: true, createdAt: true },
      });
    } catch (e: any) {
      if (e.code === 'P2002') throw new BadRequestException('Ya existe un administrador de plataforma con ese email');
      throw e;
    }
  }
}
