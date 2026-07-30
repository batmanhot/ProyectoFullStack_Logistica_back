import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAreaInternaDto } from './dto/create-area-interna.dto';
import { UpdateAreaInternaDto } from './dto/update-area-interna.dto';

@Injectable()
export class AreasInternasService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, incluirInactivas = false) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.areaInterna.findMany({
        where: { empresaId, ...(!incluirInactivas && { activo: true }) },
        orderBy: { nombre: 'asc' },
      }),
    );
  }

  async findOne(empresaId: string, id: string) {
    const area = await this.prisma.withTenant(empresaId, (tx) =>
      tx.areaInterna.findFirst({ where: { id, empresaId } }),
    );
    if (!area) throw new NotFoundException('Área interna no encontrada');
    return area;
  }

  async create(empresaId: string, dto: CreateAreaInternaDto) {
    try {
      return await this.prisma.withTenant(empresaId, (tx) =>
        tx.areaInterna.create({ data: { empresaId, ...dto } }),
      );
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new BadRequestException('Ya existe un área con ese código en esta empresa');
      }
      throw e;
    }
  }

  async update(empresaId: string, id: string, dto: UpdateAreaInternaDto) {
    await this.findOne(empresaId, id);
    try {
      return await this.prisma.withTenant(empresaId, (tx) =>
        tx.areaInterna.update({ where: { id }, data: dto }),
      );
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new BadRequestException('Ya existe un área con ese código en esta empresa');
      }
      throw e;
    }
  }

  /** Soft-delete: nunca borra la fila — Usuarios/PedidosInternos la referencian por FK. */
  async remove(empresaId: string, id: string) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.areaInterna.update({ where: { id }, data: { activo: false } }),
    );
  }
}
