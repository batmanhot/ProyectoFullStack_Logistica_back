import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransportistaDto } from './dto/create-transportista.dto';
import { UpdateTransportistaDto } from './dto/update-transportista.dto';

@Injectable()
export class TransportistasService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, incluirInactivos = false) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.transportista.findMany({
        where: { empresaId, ...(!incluirInactivos && { activo: true }) },
        orderBy: { nombre: 'asc' },
      }),
    );
  }

  async findOne(empresaId: string, id: string) {
    const transportista = await this.prisma.withTenant(empresaId, (tx) =>
      tx.transportista.findFirst({ where: { id, empresaId } }),
    );
    if (!transportista) throw new NotFoundException('Transportista no encontrado');
    return transportista;
  }

  create(empresaId: string, dto: CreateTransportistaDto) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.transportista.create({ data: { empresaId, ...dto } }),
    );
  }

  async update(empresaId: string, id: string, dto: UpdateTransportistaDto) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.transportista.update({ where: { id }, data: dto }),
    );
  }

  /** Soft-delete: nunca borra la fila — Rutas históricas lo referencian por FK. */
  async remove(empresaId: string, id: string) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.transportista.update({ where: { id }, data: { activo: false } }),
    );
  }
}
