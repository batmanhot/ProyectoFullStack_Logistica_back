import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoriaDto } from './dto/create-categoria.dto';
import { UpdateCategoriaDto } from './dto/update-categoria.dto';

@Injectable()
export class CategoriasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Por defecto solo lista activas — las inactivas (soft-deleted) quedan
   * disponibles vía ?incluirInactivas=true para no estorbar en el día a día
   * pero seguir siendo auditables/reactivables.
   */
  findAll(empresaId: string, busqueda?: string, incluirInactivas = false) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.categoria.findMany({
        where: {
          empresaId,
          ...(busqueda && { nombre: { contains: busqueda, mode: 'insensitive' } }),
          ...(!incluirInactivas && { estado: 'Activo' }),
        },
        orderBy: { nombre: 'asc' },
      }),
    );
  }

  async findOne(empresaId: string, id: string) {
    const categoria = await this.prisma.withTenant(empresaId, (tx) =>
      tx.categoria.findFirst({ where: { id, empresaId } }),
    );
    if (!categoria) throw new NotFoundException('Categoría no encontrada');
    return categoria;
  }

  async create(empresaId: string, dto: CreateCategoriaDto) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.categoria.create({
        data: { empresaId, nombre: dto.nombre, descripcion: dto.descripcion },
      }),
    );
  }

  async update(empresaId: string, id: string, dto: UpdateCategoriaDto) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.categoria.update({
        where: { id },
        data: {
          ...(dto.nombre !== undefined && { nombre: dto.nombre }),
          ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
          ...(dto.estado !== undefined && { estado: dto.estado }),
        },
      }),
    );
  }

  /** Soft-delete: nunca borra la fila — Productos (Fase 3) la referencian por FK. */
  async remove(empresaId: string, id: string) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.categoria.update({ where: { id }, data: { estado: 'Inactivo' } }),
    );
  }
}
