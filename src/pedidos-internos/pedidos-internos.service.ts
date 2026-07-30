import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoPedidoInterno, TipoMovimiento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MovimientosService } from '../movimientos/movimientos.service';
import { CreatePedidoInternoDto } from './dto/create-pedido-interno.dto';
import { UpdatePedidoInternoDto } from './dto/update-pedido-interno.dto';
import { AprobarPedidoDto, RechazarPedidoDto } from './dto/aprobar-rechazar.dto';
import { validarEnum } from '../common/utils/validar-enum.util';
import { assertExists } from '../common/utils/assert-exists.util';

@Injectable()
export class PedidosInternosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movimientosService: MovimientosService,
  ) {}

  findAll(empresaId: string, filtros: { areaId?: string; estado?: string } = {}) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.pedidoInterno.findMany({
        where: {
          empresaId,
          ...(filtros.areaId && { areaId: filtros.areaId }),
          ...(filtros.estado && { estado: validarEnum(filtros.estado, Object.values(EstadoPedidoInterno)) }),
        },
        include: { items: true, area: { select: { nombre: true, codigo: true } } },
        orderBy: { fecha: 'desc' },
        take: 500,
      }),
    );
  }

  async findOne(empresaId: string, id: string) {
    const pedido = await this.prisma.withTenant(empresaId, (tx) =>
      tx.pedidoInterno.findFirst({ where: { id, empresaId }, include: { items: true } }),
    );
    if (!pedido) throw new NotFoundException('Pedido interno no encontrado');
    return pedido;
  }

  /** Siempre crea en BORRADOR — enviar() es una transición explícita aparte. */
  async create(empresaId: string, usuarioSolicitaId: string, dto: CreatePedidoInternoDto) {
    await this.validarArea(empresaId, dto.areaId);
    await this.validarAlmacen(empresaId, dto.almacenId);
    for (const item of dto.items) {
      await this.validarProducto(empresaId, item.productoId);
    }

    return this.prisma.withTenant(empresaId, async (tx) => {
      const cantidadPrevia = await tx.pedidoInterno.count({ where: { empresaId } });
      const numero = `PI-${String(cantidadPrevia + 1).padStart(5, '0')}`;

      try {
        return await tx.pedidoInterno.create({
          data: {
            empresaId,
            numero,
            areaId: dto.areaId,
            almacenId: dto.almacenId,
            fechaRequerida: dto.fechaRequerida ? new Date(dto.fechaRequerida) : null,
            prioridad: dto.prioridad,
            notasSolicitud: dto.notasSolicitud,
            usuarioSolicitaId,
            items: {
              create: dto.items.map((i) => ({
                productoId: i.productoId,
                cantidad: i.cantidad,
                unidadMedida: i.unidadMedida,
                notas: i.notas,
              })),
            },
          },
          include: { items: true },
        });
      } catch (e: any) {
        if (e.code === 'P2002') {
          throw new BadRequestException('Ya existe un pedido interno con ese número, intenta de nuevo');
        }
        throw e;
      }
    });
  }

  async update(empresaId: string, id: string, dto: UpdatePedidoInternoDto) {
    const pedido = await this.findOne(empresaId, id);
    if (pedido.estado !== 'BORRADOR') {
      throw new ForbiddenException('Solo se puede editar un pedido en estado BORRADOR');
    }
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.pedidoInterno.update({
        where: { id },
        data: {
          ...(dto.fechaRequerida !== undefined && { fechaRequerida: new Date(dto.fechaRequerida) }),
          ...(dto.prioridad !== undefined && { prioridad: dto.prioridad }),
          ...(dto.notasSolicitud !== undefined && { notasSolicitud: dto.notasSolicitud }),
        },
        include: { items: true },
      }),
    );
  }

  /** BORRADOR -> ENVIADO. */
  async enviar(empresaId: string, id: string) {
    return this.transicionSimple(empresaId, id, ['BORRADOR'], 'ENVIADO');
  }

  /** ENVIADO -> APROBADO. */
  async aprobar(empresaId: string, id: string, usuarioApruebaId: string, dto: AprobarPedidoDto) {
    const pedido = await this.findOne(empresaId, id);
    if (pedido.estado !== 'ENVIADO') {
      throw new ForbiddenException(`No se puede aprobar un pedido en estado ${pedido.estado}`);
    }
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.pedidoInterno.update({
        where: { id },
        data: {
          estado: 'APROBADO',
          fechaAprobacion: new Date(),
          usuarioApruebaId,
          notasAprobacion: dto.notas,
        },
        include: { items: true },
      }),
    );
  }

  /** ENVIADO -> RECHAZADO. */
  async rechazar(empresaId: string, id: string, usuarioApruebaId: string, dto: RechazarPedidoDto) {
    const pedido = await this.findOne(empresaId, id);
    if (pedido.estado !== 'ENVIADO') {
      throw new ForbiddenException(`No se puede rechazar un pedido en estado ${pedido.estado}`);
    }
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.pedidoInterno.update({
        where: { id },
        data: {
          estado: 'RECHAZADO',
          usuarioApruebaId,
          motivoRechazo: dto.motivo,
        },
        include: { items: true },
      }),
    );
  }

  /** APROBADO -> PICKING. */
  async marcarPicking(empresaId: string, id: string) {
    return this.transicionSimple(empresaId, id, ['APROBADO'], 'PICKING');
  }

  /**
   * PICKING -> ENTREGADO. Decisión de Fase 6: genera un Movimiento SALIDA
   * REAL por cada ítem (gap del frontend original, corregido aquí) —
   * integrado con el motor de Fase 3, en la misma transacción.
   */
  async entregar(empresaId: string, id: string, usuarioEntregaId: string) {
    const pedido = await this.findOne(empresaId, id);
    if (pedido.estado !== 'PICKING') {
      throw new ForbiddenException(`No se puede entregar un pedido en estado ${pedido.estado}`);
    }

    return this.prisma.withTenant(empresaId, async (tx) => {
      for (const item of pedido.items) {
        await this.movimientosService.crearEnTransaccion(tx, empresaId, {
          tipo: TipoMovimiento.SALIDA,
          productoId: item.productoId,
          almacenId: pedido.almacenId,
          cantidad: Number(item.cantidad),
          motivo: `Pedido interno ${pedido.numero}`,
          documento: pedido.numero,
        } as any);
      }

      return tx.pedidoInterno.update({
        where: { id },
        data: { estado: 'ENTREGADO', fechaEntrega: new Date(), usuarioEntregaId },
        include: { items: true },
      });
    });
  }

  /** El solicitante confirma que recibió el material — flag, no cambia `estado`. */
  async confirmarRecibo(empresaId: string, id: string) {
    const pedido = await this.findOne(empresaId, id);
    if (pedido.estado !== 'ENTREGADO') {
      throw new ForbiddenException('Solo se puede confirmar recibo de un pedido ENTREGADO');
    }
    if (pedido.reciboConfirmado) {
      throw new BadRequestException('El recibo de este pedido ya estaba confirmado');
    }
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.pedidoInterno.update({
        where: { id },
        data: { reciboConfirmado: true, fechaReciboConfirmado: new Date() },
      }),
    );
  }

  private async transicionSimple(empresaId: string, id: string, desde: string[], hacia: string) {
    const pedido = await this.findOne(empresaId, id);
    if (!desde.includes(pedido.estado)) {
      throw new ForbiddenException(`No se puede pasar de ${pedido.estado} a ${hacia}`);
    }
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.pedidoInterno.update({
        where: { id },
        data: { estado: hacia as any },
        include: { items: true },
      }),
    );
  }

  private validarArea(empresaId: string, areaId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.areaInterna.findFirst({ where: { id: areaId, empresaId } })),
      'El área indicada no existe o no pertenece a esta empresa',
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
