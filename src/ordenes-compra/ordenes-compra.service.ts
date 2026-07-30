import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoOrdenCompra, TipoMovimiento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MovimientosService } from '../movimientos/movimientos.service';
import { CreateOrdenCompraDto } from './dto/create-orden-compra.dto';
import { UpdateOrdenCompraDto } from './dto/update-orden-compra.dto';
import { RecibirOrdenCompraDto } from './dto/recibir-orden-compra.dto';
import { validarEnum } from '../common/utils/validar-enum.util';
import { assertExists } from '../common/utils/assert-exists.util';

// Tasa estándar de IGV en Perú — el documento no la especifica explícitamente
// para Orden de Compra; se asume 18% por ser el valor vigente y único en uso
// en el resto del dataset demo (ver demoData.js, campo `igv` en OC/Proformas).
const IGV_RATE = 0.18;

@Injectable()
export class OrdenesCompraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movimientosService: MovimientosService,
  ) {}

  findAll(empresaId: string, filtros: { proveedorId?: string; estado?: string } = {}) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.ordenCompra.findMany({
        where: {
          empresaId,
          ...(filtros.proveedorId && { proveedorId: filtros.proveedorId }),
          ...(filtros.estado && { estado: validarEnum(filtros.estado, Object.values(EstadoOrdenCompra)) }),
        },
        include: {
          items: true,
          proveedor: { select: { razonSocial: true } },
          almacen: { select: { nombre: true } },
        },
        orderBy: { fecha: 'desc' },
        take: 500,
      }),
    );
  }

  async findOne(empresaId: string, id: string) {
    const orden = await this.prisma.withTenant(empresaId, (tx) =>
      tx.ordenCompra.findFirst({
        where: { id, empresaId },
        include: { items: true },
      }),
    );
    if (!orden) throw new NotFoundException('Orden de compra no encontrada');
    return orden;
  }

  async create(empresaId: string, dto: CreateOrdenCompraDto) {
    await this.validarProveedor(empresaId, dto.proveedorId);
    await this.validarAlmacen(empresaId, dto.almacenId);
    for (const item of dto.items) {
      await this.validarProducto(empresaId, item.productoId);
    }

    const subtotal = dto.items.reduce((acc, i) => acc + i.cantidad * i.costoUnitario, 0);
    const igv = Math.round(subtotal * IGV_RATE * 100) / 100;
    const total = subtotal + igv;

    return this.prisma.withTenant(empresaId, async (tx) => {
      const cantidadPrevia = await tx.ordenCompra.count({ where: { empresaId } });
      const numero = `OC-${String(cantidadPrevia + 1).padStart(5, '0')}`;

      try {
        return await tx.ordenCompra.create({
          data: {
            empresaId,
            numero,
            proveedorId: dto.proveedorId,
            almacenId: dto.almacenId,
            fechaEntrega: dto.fechaEntrega ? new Date(dto.fechaEntrega) : null,
            subtotal,
            igv,
            total,
            notas: dto.notas,
            items: {
              create: dto.items.map((i) => ({
                productoId: i.productoId,
                cantidad: i.cantidad,
                costoUnitario: i.costoUnitario,
              })),
            },
          },
          include: { items: true },
        });
      } catch (e: any) {
        if (e.code === 'P2002') {
          throw new BadRequestException('Ya existe una orden de compra con ese número, intenta de nuevo');
        }
        throw e;
      }
    });
  }

  async update(empresaId: string, id: string, dto: UpdateOrdenCompraDto) {
    const orden = await this.findOne(empresaId, id);
    if (orden.estado === 'RECIBIDA' || orden.estado === 'CANCELADA') {
      throw new ForbiddenException('No se puede modificar una orden ya RECIBIDA o CANCELADA');
    }

    return this.prisma.withTenant(empresaId, async (tx) => {
      try {
        return await tx.ordenCompra.update({
          where: { id },
          data: {
            ...(dto.fechaEntrega !== undefined && { fechaEntrega: new Date(dto.fechaEntrega) }),
            ...(dto.notas !== undefined && { notas: dto.notas }),
            ...(dto.estado !== undefined && { estado: dto.estado }),
          },
          include: { items: true },
        });
      } catch (e: any) {
        if (e.code === 'P2025') throw new NotFoundException('Orden de compra no encontrada');
        throw e;
      }
    });
  }

  /**
   * Recepción de mercadería — genera un Movimiento ENTRADA REAL por cada
   * ítem recibido, en la MISMA transacción que el incremento de
   * cantidadRecibida (decisión de Fase 4).
   *
   * Todas las validaciones que NO requieren la transacción (pertenencia del
   * ítem, cantidad disponible a recibir) se hacen ANTES de abrir `tx` —
   * fail-fast, sin pagar el costo de un BEGIN para una request inválida.
   */
  async recibir(empresaId: string, id: string, dto: RecibirOrdenCompraDto) {
    const orden = await this.findOne(empresaId, id);
    if (orden.estado === 'RECIBIDA' || orden.estado === 'CANCELADA') {
      throw new ForbiddenException(`No se puede recepcionar una orden en estado ${orden.estado}`);
    }

    const itemsAProcesar = dto.items.map((itemRecibido) => {
      const item = orden.items.find((i) => i.id === itemRecibido.ordenCompraItemId);
      if (!item) {
        throw new BadRequestException(
          `El ítem ${itemRecibido.ordenCompraItemId} no pertenece a esta orden`,
        );
      }
      const pendiente = Number(item.cantidad) - Number(item.cantidadRecibida);
      if (itemRecibido.cantidad > pendiente) {
        throw new BadRequestException(
          `No se puede recibir más de lo pendiente (producto ${item.productoId}): pendiente ${pendiente}, se intentó recibir ${itemRecibido.cantidad}`,
        );
      }
      return { item, cantidadARecibir: itemRecibido.cantidad };
    });

    return this.prisma.withTenant(empresaId, async (tx) => {
      for (const { item, cantidadARecibir } of itemsAProcesar) {
        await this.movimientosService.crearEnTransaccion(tx, empresaId, {
          tipo: TipoMovimiento.ENTRADA,
          productoId: item.productoId,
          almacenId: orden.almacenId,
          cantidad: cantidadARecibir,
          costoUnitario: Number(item.costoUnitario),
          motivo: `Recepción OC ${orden.numero}`,
          documento: orden.numero,
        } as any);

        await tx.ordenCompraItem.update({
          where: { id: item.id },
          data: { cantidadRecibida: { increment: cantidadARecibir } },
        });
      }

      const itemsActualizados = await tx.ordenCompraItem.findMany({
        where: { ordenCompraId: id },
      });
      const totalmenteRecibida = itemsActualizados.every(
        (i) => Number(i.cantidadRecibida) >= Number(i.cantidad),
      );
      const algoRecibido = itemsActualizados.some((i) => Number(i.cantidadRecibida) > 0);
      const nuevoEstado = totalmenteRecibida ? 'RECIBIDA' : algoRecibido ? 'PARCIAL' : orden.estado;

      return tx.ordenCompra.update({
        where: { id },
        data: { estado: nuevoEstado },
        include: { items: true },
      });
    });
  }

  private validarProveedor(empresaId: string, proveedorId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.proveedor.findFirst({ where: { id: proveedorId, empresaId } })),
      'El proveedor indicado no existe o no pertenece a esta empresa',
    );
  }

  private validarAlmacen(empresaId: string, almacenId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.almacen.findFirst({ where: { id: almacenId, empresaId } })),
      'El almacén indicado no existe o no pertenece a esta empresa',
    );
  }

  private validarProducto(empresaId: string, productoId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.producto.findFirst({ where: { id: productoId, empresaId } })),
      `El producto ${productoId} no existe o no pertenece a esta empresa`,
    );
  }
}
