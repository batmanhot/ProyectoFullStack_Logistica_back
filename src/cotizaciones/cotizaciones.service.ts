import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoCotizacion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';
import { UpdateCotizacionDto } from './dto/update-cotizacion.dto';
import { CreateRespuestaDto } from './dto/create-respuesta.dto';
import { validarEnum } from '../common/utils/validar-enum.util';
import { assertExists } from '../common/utils/assert-exists.util';

@Injectable()
export class CotizacionesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, estado?: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.cotizacion.findMany({
        where: { empresaId, ...(estado && { estado: validarEnum(estado, Object.values(EstadoCotizacion)) }) },
        include: { items: true, respuestas: { select: { id: true, proveedorId: true, total: true, ganadora: true } } },
        orderBy: { fecha: 'desc' },
        take: 500,
      }),
    );
  }

  async findOne(empresaId: string, id: string) {
    const cotizacion = await this.prisma.withTenant(empresaId, (tx) =>
      tx.cotizacion.findFirst({
        where: { id, empresaId },
        include: {
          items: true,
          respuestas: { include: { items: true } },
        },
      }),
    );
    if (!cotizacion) throw new NotFoundException('Cotización no encontrada');
    return cotizacion;
  }

  async create(empresaId: string, dto: CreateCotizacionDto) {
    for (const item of dto.items) {
      await this.validarProducto(empresaId, item.productoId);
    }

    return this.prisma.withTenant(empresaId, async (tx) => {
      const cantidadPrevia = await tx.cotizacion.count({ where: { empresaId } });
      const numero = `RFQ-${String(cantidadPrevia + 1).padStart(5, '0')}`;

      try {
        return await tx.cotizacion.create({
          data: {
            empresaId,
            numero,
            fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null,
            notas: dto.notas,
            items: {
              create: dto.items.map((i) => ({
                productoId: i.productoId,
                descripcion: i.descripcion,
                cantidad: i.cantidad,
              })),
            },
          },
          include: { items: true },
        });
      } catch (e: any) {
        if (e.code === 'P2002') {
          throw new BadRequestException('Ya existe una cotización con ese número, intenta de nuevo');
        }
        throw e;
      }
    });
  }

  async update(empresaId: string, id: string, dto: UpdateCotizacionDto) {
    const cotizacion = await this.findOne(empresaId, id);
    if (cotizacion.estado === 'ADJUDICADA' || cotizacion.estado === 'CANCELADA') {
      throw new ForbiddenException(`No se puede modificar una cotización en estado ${cotizacion.estado}`);
    }

    return this.prisma.withTenant(empresaId, async (tx) => {
      try {
        return await tx.cotizacion.update({
          where: { id },
          data: {
            ...(dto.fechaVencimiento !== undefined && { fechaVencimiento: new Date(dto.fechaVencimiento) }),
            ...(dto.notas !== undefined && { notas: dto.notas }),
            ...(dto.estado !== undefined && { estado: dto.estado }),
          },
          include: { items: true },
        });
      } catch (e: any) {
        if (e.code === 'P2025') throw new NotFoundException('Cotización no encontrada');
        throw e;
      }
    });
  }

  /** "Eliminar" = CANCELADA (no hay borrado físico de un RFQ con respuestas asociadas). */
  async remove(empresaId: string, id: string) {
    const cotizacion = await this.findOne(empresaId, id);
    if (cotizacion.estado === 'ADJUDICADA') {
      throw new ForbiddenException('No se puede cancelar una cotización ya adjudicada');
    }
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.cotizacion.update({ where: { id }, data: { estado: 'CANCELADA' } }),
    );
  }

  /**
   * Agrega la respuesta de UN proveedor. El subtotal de cada ítem se calcula
   * server-side como precioUnitario × cantidad solicitada en la Cotizacion
   * (el proveedor no puede inflar la cantidad, solo cotiza precio).
   */
  async agregarRespuesta(empresaId: string, cotizacionId: string, dto: CreateRespuestaDto) {
    const cotizacion = await this.findOne(empresaId, cotizacionId);
    if (cotizacion.estado === 'ADJUDICADA' || cotizacion.estado === 'CANCELADA') {
      throw new ForbiddenException(
        `No se pueden agregar respuestas a una cotización en estado ${cotizacion.estado}`,
      );
    }

    await this.validarProveedor(empresaId, dto.proveedorId);

    const yaRespondio = cotizacion.respuestas.some((r) => r.proveedorId === dto.proveedorId);
    if (yaRespondio) {
      throw new ConflictException('Este proveedor ya respondió esta cotización');
    }

    const itemsConSubtotal = dto.items.map((i) => {
      const itemCotizado = cotizacion.items.find((ci) => ci.productoId === i.productoId);
      if (!itemCotizado) {
        throw new BadRequestException(
          `El producto ${i.productoId} no forma parte de los ítems solicitados en esta cotización`,
        );
      }
      const subtotal = i.precioUnitario * Number(itemCotizado.cantidad);
      return { productoId: i.productoId, precioUnitario: i.precioUnitario, subtotal };
    });

    const total = itemsConSubtotal.reduce((acc, i) => acc + i.subtotal, 0);

    return this.prisma.withTenant(empresaId, async (tx) => {
      const respuesta = await tx.respuestaProveedor.create({
        data: {
          cotizacionId,
          proveedorId: dto.proveedorId,
          tiempoEntrega: dto.tiempoEntrega,
          notas: dto.notas,
          total,
          items: { create: itemsConSubtotal },
        },
        include: { items: true },
      });

      // BORRADOR/ENVIADA -> RESPONDIDA en cuanto llega la primera respuesta.
      if (cotizacion.estado === 'BORRADOR' || cotizacion.estado === 'ENVIADA') {
        await tx.cotizacion.update({ where: { id: cotizacionId }, data: { estado: 'RESPONDIDA' } });
      }

      return respuesta;
    });
  }

  /**
   * Marca una respuesta como ganadora — exclusividad: cualquier otra
   * respuesta de la misma cotización se desmarca automáticamente.
   * Mueve la cotización a ADJUDICADA.
   */
  async marcarGanadora(empresaId: string, cotizacionId: string, respuestaId: string) {
    const cotizacion = await this.findOne(empresaId, cotizacionId);
    const respuesta = cotizacion.respuestas.find((r) => r.id === respuestaId);
    if (!respuesta) {
      throw new NotFoundException('La respuesta indicada no pertenece a esta cotización');
    }
    if (cotizacion.estado === 'CANCELADA') {
      throw new ForbiddenException('No se puede adjudicar una cotización cancelada');
    }

    return this.prisma.withTenant(empresaId, async (tx) => {
      await tx.respuestaProveedor.updateMany({
        where: { cotizacionId },
        data: { ganadora: false },
      });
      await tx.respuestaProveedor.update({
        where: { id: respuestaId },
        data: { ganadora: true },
      });
      return tx.cotizacion.update({
        where: { id: cotizacionId },
        data: { estado: 'ADJUDICADA' },
        include: { items: true, respuestas: { include: { items: true } } },
      });
    });
  }

  private validarProducto(empresaId: string, productoId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.producto.findFirst({ where: { id: productoId, empresaId } })),
      `El producto ${productoId} no existe o no pertenece a esta empresa`,
    );
  }

  private validarProveedor(empresaId: string, proveedorId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.proveedor.findFirst({ where: { id: proveedorId, empresaId } })),
      'El proveedor indicado no existe o no pertenece a esta empresa',
    );
  }
}
