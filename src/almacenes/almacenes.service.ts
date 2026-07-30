import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAlmacenDto } from './dto/create-almacen.dto';
import { UpdateAlmacenDto } from './dto/update-almacen.dto';

@Injectable()
export class AlmacenesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, busqueda?: string, incluirInactivos = false) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.almacen.findMany({
        where: {
          empresaId,
          ...(busqueda && { nombre: { contains: busqueda, mode: 'insensitive' } }),
          ...(!incluirInactivos && { activo: true }),
        },
        orderBy: { nombre: 'asc' },
      }),
    );
  }

  async findOne(empresaId: string, id: string) {
    const almacen = await this.prisma.withTenant(empresaId, (tx) =>
      tx.almacen.findFirst({ where: { id, empresaId } }),
    );
    if (!almacen) throw new NotFoundException('Almacén no encontrado');
    return almacen;
  }

  create(empresaId: string, dto: CreateAlmacenDto) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.almacen.create({ data: { empresaId, nombre: dto.nombre } }),
    );
  }

  async update(empresaId: string, id: string, dto: UpdateAlmacenDto) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.almacen.update({
        where: { id },
        data: {
          ...(dto.nombre !== undefined && { nombre: dto.nombre }),
          ...(dto.activo !== undefined && { activo: dto.activo }),
        },
      }),
    );
  }

  /** Soft-delete: nunca borra la fila — Inventario/Movimientos (Fase 3) la referencian por FK. */
  async remove(empresaId: string, id: string) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.almacen.update({ where: { id }, data: { activo: false } }),
    );
  }
}
