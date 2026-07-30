import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLoteDto } from './dto/create-lote.dto';
import { UpdateLoteDto } from './dto/update-lote.dto';
import { assertExists } from '../common/utils/assert-exists.util';

@Injectable()
export class LotesService {
  constructor(private readonly prisma: PrismaService) {}

  /** LoteProducto no tiene empresaId propio — se escopa vía producto.empresaId (mismo patrón que Ubicacion -> Almacen en Fase 2). */
  findAll(empresaId: string, productoId?: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.loteProducto.findMany({
        where: { producto: { empresaId }, ...(productoId && { productoId }) },
        orderBy: { fechaVencimiento: 'asc' },
      }),
    );
  }

  async findOne(empresaId: string, id: string) {
    const lote = await this.prisma.withTenant(empresaId, (tx) =>
      tx.loteProducto.findFirst({ where: { id, producto: { empresaId } } }),
    );
    if (!lote) throw new NotFoundException('Lote no encontrado');
    return lote;
  }

  async create(empresaId: string, dto: CreateLoteDto) {
    await this.validarProducto(empresaId, dto.productoId);

    try {
      return await this.prisma.withTenant(empresaId, (tx) =>
        tx.loteProducto.create({
          data: {
            productoId: dto.productoId,
            numero: dto.numero,
            fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null,
            cantidadOriginal: dto.cantidadOriginal,
            // Al crear, todo el lote está disponible — los Movimientos lo van consumiendo.
            cantidadActual: dto.cantidadOriginal,
          },
        }),
      );
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new BadRequestException('Ya existe un lote con ese número para este producto');
      }
      throw e;
    }
  }

  async update(empresaId: string, id: string, dto: UpdateLoteDto) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.loteProducto.update({
        where: { id },
        data: {
          ...(dto.fechaVencimiento !== undefined && { fechaVencimiento: new Date(dto.fechaVencimiento) }),
          ...(dto.estado !== undefined && { estado: dto.estado }),
        },
      }),
    );
  }

  /** "Eliminar" = marcar Vencido (nunca se borra: Movimientos lo referencian por FK). */
  async remove(empresaId: string, id: string) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.loteProducto.update({ where: { id }, data: { estado: 'Vencido' } }),
    );
  }

  private validarProducto(empresaId: string, productoId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.producto.findFirst({ where: { id: productoId, empresaId } })),
      'El producto indicado no existe o no pertenece a esta empresa',
    );
  }
}
