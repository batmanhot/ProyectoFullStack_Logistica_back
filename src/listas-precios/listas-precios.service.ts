import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateListaPreciosDto } from './dto/create-lista-precios.dto';
import { UpdateListaPreciosDto } from './dto/update-lista-precios.dto';

@Injectable()
export class ListasPreciosService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.listaPrecios.findMany({
        where: { empresaId },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  async findOne(empresaId: string, id: string) {
    const lista = await this.prisma.withTenant(empresaId, (tx) =>
      tx.listaPrecios.findFirst({ where: { id, empresaId } }),
    );
    if (!lista) throw new NotFoundException('Lista de precios no encontrada');
    return lista;
  }

  create(empresaId: string, dto: CreateListaPreciosDto) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.listaPrecios.create({
        data: {
          empresaId,
          nombre: dto.nombre,
          tipo: dto.tipo ?? 'general',
          descuento: dto.descuento ?? 0,
          markup: dto.markup ?? 0,
          activa: dto.activa ?? true,
          precios: (dto.precios as any) ?? {},
        },
      }),
    );
  }

  async update(empresaId: string, id: string, dto: UpdateListaPreciosDto) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.listaPrecios.update({
        where: { id },
        data: {
          ...(dto.nombre     !== undefined && { nombre:    dto.nombre }),
          ...(dto.tipo       !== undefined && { tipo:      dto.tipo }),
          ...(dto.descuento  !== undefined && { descuento: dto.descuento }),
          ...(dto.markup     !== undefined && { markup:    dto.markup }),
          ...(dto.activa     !== undefined && { activa:    dto.activa }),
          ...(dto.precios    !== undefined && { precios:   dto.precios as any }),
        },
      }),
    );
  }

  async remove(empresaId: string, id: string) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.listaPrecios.delete({ where: { id } }),
    );
  }

  /** Actualiza o inserta un precio especial para un producto específico. */
  async setPrecioProducto(empresaId: string, id: string, productoId: string, precio: number | null) {
    const lista = await this.findOne(empresaId, id);
    const precios = (lista.precios as Record<string, number>) ?? {};
    if (precio === null) {
      delete precios[productoId];
    } else {
      precios[productoId] = precio;
    }
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.listaPrecios.update({ where: { id }, data: { precios: precios as any } }),
    );
  }

  /** Duplica una lista existente. */
  async duplicar(empresaId: string, id: string) {
    const original = await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.listaPrecios.create({
        data: {
          empresaId,
          nombre:    `${original.nombre} (copia)`,
          tipo:      original.tipo,
          descuento: original.descuento,
          markup:    original.markup,
          activa:    true,
          precios:   (original.precios as any) ?? {},
        },
      }),
    );
  }
}
