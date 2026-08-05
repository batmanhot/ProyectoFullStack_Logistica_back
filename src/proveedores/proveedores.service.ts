import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProveedorDto } from './dto/create-proveedor.dto';
import { UpdateProveedorDto } from './dto/update-proveedor.dto';

@Injectable()
export class ProveedoresService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * El filtro `contains + mode: insensitive` se traduce a ILIKE '%term%' en
   * Postgres, que SÍ puede usar el índice GIN de pg_trgm ya definido sobre
   * razonSocial (sección 4 del schema) — reemplaza el .includes() en JS
   * que hace hoy storage.js, sin necesidad de SQL crudo.
   */
  findAll(empresaId: string, busqueda?: string, incluirInactivos = false) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.proveedor.findMany({
        where: {
          empresaId,
          ...(busqueda && { razonSocial: { contains: busqueda, mode: 'insensitive' } }),
          ...(!incluirInactivos && { activo: true }),
        },
        orderBy: { razonSocial: 'asc' },
      }),
    );
  }

  async findOne(empresaId: string, id: string) {
    const proveedor = await this.prisma.withTenant(empresaId, (tx) =>
      tx.proveedor.findFirst({ where: { id, empresaId } }),
    );
    if (!proveedor) throw new NotFoundException('Proveedor no encontrado');
    return proveedor;
  }

  async create(empresaId: string, dto: CreateProveedorDto) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.proveedor.create({
        data: {
          empresaId,
          razonSocial: dto.razonSocial,
          ruc: dto.ruc,
          telefono: dto.telefono,
          email: dto.email,
          direccion: dto.direccion,
          paisOrigen: dto.paisOrigen,
          ...(dto.monedaNegociacion !== undefined && { monedaNegociacion: dto.monedaNegociacion }),
        },
      }),
    );
  }

  async update(empresaId: string, id: string, dto: UpdateProveedorDto) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.proveedor.update({
        where: { id },
        data: {
          ...(dto.razonSocial !== undefined && { razonSocial: dto.razonSocial }),
          ...(dto.ruc !== undefined && { ruc: dto.ruc }),
          ...(dto.telefono !== undefined && { telefono: dto.telefono }),
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.direccion !== undefined && { direccion: dto.direccion }),
          ...(dto.activo !== undefined && { activo: dto.activo }),
          ...(dto.paisOrigen !== undefined && { paisOrigen: dto.paisOrigen }),
          ...(dto.monedaNegociacion !== undefined && { monedaNegociacion: dto.monedaNegociacion }),
        },
      }),
    );
  }

  /** Soft-delete: nunca borra la fila — Productos (Fase 3) lo referencian por FK. */
  async remove(empresaId: string, id: string) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.proveedor.update({ where: { id }, data: { activo: false } }),
    );
  }
}
