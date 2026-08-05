import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { assertExists } from '../common/utils/assert-exists.util';

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, busqueda?: string, incluirInactivos = false) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.cliente.findMany({
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
    const cliente = await this.prisma.withTenant(empresaId, (tx) =>
      tx.cliente.findFirst({ where: { id, empresaId } }),
    );
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    return cliente;
  }

  async create(empresaId: string, dto: CreateClienteDto) {
    if (dto.listaPrecioId) await this.validarListaPrecio(empresaId, dto.listaPrecioId);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.cliente.create({
        data: {
          empresaId,
          razonSocial: dto.razonSocial,
          ruc: dto.ruc,
          contacto: dto.contacto,
          telefono: dto.telefono,
          email: dto.email,
          direccion: dto.direccion,
          condicionPago: dto.condicionPago,
          limiteCredito: dto.limiteCredito,
          notas: dto.notas,
          listaPrecioId: dto.listaPrecioId,
        },
      }),
    );
  }

  async update(empresaId: string, id: string, dto: UpdateClienteDto) {
    await this.findOne(empresaId, id);
    if (dto.listaPrecioId) await this.validarListaPrecio(empresaId, dto.listaPrecioId);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.cliente.update({
        where: { id },
        data: {
          ...(dto.razonSocial !== undefined && { razonSocial: dto.razonSocial }),
          ...(dto.ruc !== undefined && { ruc: dto.ruc }),
          ...(dto.contacto !== undefined && { contacto: dto.contacto }),
          ...(dto.telefono !== undefined && { telefono: dto.telefono }),
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.direccion !== undefined && { direccion: dto.direccion }),
          ...(dto.condicionPago !== undefined && { condicionPago: dto.condicionPago }),
          ...(dto.limiteCredito !== undefined && { limiteCredito: dto.limiteCredito }),
          ...(dto.notas !== undefined && { notas: dto.notas }),
          ...(dto.activo !== undefined && { activo: dto.activo }),
          ...(dto.listaPrecioId !== undefined && { listaPrecioId: dto.listaPrecioId }),
        },
      }),
    );
  }

  /** Soft-delete: nunca borra la fila — Proformas/CxC lo referencian por FK. */
  async remove(empresaId: string, id: string) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.cliente.update({ where: { id }, data: { activo: false } }),
    );
  }

  private validarListaPrecio(empresaId: string, listaPrecioId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.listaPrecios.findFirst({ where: { id: listaPrecioId, empresaId } })),
      'La lista de precios indicada no existe o no pertenece a esta empresa',
    );
  }
}
