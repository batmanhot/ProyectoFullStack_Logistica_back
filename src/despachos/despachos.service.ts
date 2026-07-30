import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoDespacho, PrismaClient, TipoMovimiento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MovimientosService } from '../movimientos/movimientos.service';
import { CreateDespachoDto } from './dto/create-despacho.dto';
import { UpdateDespachoDto } from './dto/update-despacho.dto';
import { DespacharDto } from './dto/despachar.dto';
import { EntregarDto } from './dto/entregar.dto';
import { calcularDisponibleTotal } from '../movimientos/stock-impacto.util';
import { validarEnum } from '../common/utils/validar-enum.util';
import { assertExists } from '../common/utils/assert-exists.util';

const IGV_RATE = 0.18;

@Injectable()
export class DespachosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movimientosService: MovimientosService,
  ) {}

  findAll(empresaId: string, filtros: { clienteId?: string; estado?: string } = {}) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.despacho.findMany({
        where: {
          empresaId,
          ...(filtros.clienteId && { clienteId: filtros.clienteId }),
          ...(filtros.estado && { estado: validarEnum(filtros.estado, Object.values(EstadoDespacho)) }),
        },
        include: {
          items: true,
          cliente: { select: { razonSocial: true } },
          transportista: { select: { nombre: true } },
        },
        orderBy: { fecha: 'desc' },
        take: 500,
      }),
    );
  }

  async findOne(empresaId: string, id: string) {
    const despacho = await this.prisma.withTenant(empresaId, (tx) =>
      tx.despacho.findFirst({
        where: { id, empresaId },
        include: { items: true, transportista: { select: { nombre: true } } },
      }),
    );
    if (!despacho) throw new NotFoundException('Despacho no encontrado');
    return despacho;
  }

  /**
   * Crea el Despacho en PEDIDO y RESERVA stock de inmediato (decisión de
   * Fase 5: Stock Reservado completo). "Disponible" para nuevos despachos
   * = stock TOTAL del almacén (bucket sin asignar + ubicaciones del Mapa de
   * Almacén) menos lo ya reservado (la reserva solo se registra en el
   * bucket sin asignar). Esto NUNCA toca `cantidad` — solo un Movimiento
   * real (al despachar) la cambia.
   */
  async create(empresaId: string, dto: CreateDespachoDto) {
    await this.validarParaCrear(empresaId, dto);
    return this.prisma.withTenant(empresaId, (tx) => this.crearEnTransaccion(tx, empresaId, dto));
  }

  /**
   * Validaciones fail-fast antes de abrir transacción — separado de create()
   * para que PortalService.aprobarYConvertir() pueda validar ANTES de abrir
   * su propia transacción compartida (mismo motivo que despacharEnTransaccion
   * más abajo: evitar pagar el costo de un BEGIN para una request inválida).
   */
  async validarParaCrear(empresaId: string, dto: CreateDespachoDto) {
    await this.validarCliente(empresaId, dto.clienteId);
    await this.validarAlmacen(empresaId, dto.almacenId);
    if (dto.transportistaId) await this.validarTransportista(empresaId, dto.transportistaId);
    for (const item of dto.items) {
      await this.validarProducto(empresaId, item.productoId);
    }
    for (const item of dto.items) {
      const disponible = await this.disponible(empresaId, item.productoId, dto.almacenId);
      if (item.cantidad > disponible) {
        throw new BadRequestException(
          `Stock disponible insuficiente para reservar (producto ${item.productoId}): disponible ${disponible}, se requieren ${item.cantidad}`,
        );
      }
    }
  }

  /**
   * Crea el Despacho dentro de una transacción YA ABIERTA por el caller
   * (create() o PortalService.aprobarYConvertir(), que necesita crear el
   * Despacho y actualizar el PedidoPortal en la MISMA transacción). Asume
   * que validarParaCrear() ya corrió.
   */
  async crearEnTransaccion(tx: PrismaClient, empresaId: string, dto: CreateDespachoDto) {
    const subtotal = dto.items.reduce((acc, i) => acc + i.cantidad * i.precioVenta, 0);
    const igv = Math.round(subtotal * IGV_RATE * 100) / 100;
    const total = subtotal + igv;

    const cantidadPrevia = await tx.despacho.count({ where: { empresaId } });
    const numero = `DESP-${String(cantidadPrevia + 1).padStart(5, '0')}`;

    let despacho;
    try {
      despacho = await tx.despacho.create({
        data: {
          empresaId,
          numero,
          clienteId: dto.clienteId,
          almacenId: dto.almacenId,
          fechaEntrega: dto.fechaEntrega ? new Date(dto.fechaEntrega) : null,
          direccionEntrega: dto.direccionEntrega,
          transportistaId: dto.transportistaId,
          observaciones: dto.observaciones,
          subtotal,
          igv,
          total,
          items: {
            create: dto.items.map((i) => ({
              productoId: i.productoId,
              cantidad: i.cantidad,
              precioVenta: i.precioVenta,
              costoUnitario: i.costoUnitario,
              subtotal: i.cantidad * i.precioVenta,
              cantidadReservada: i.cantidad, // se reserva el 100% al crear
            })),
          },
        },
        include: { items: true },
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new BadRequestException('Ya existe un despacho con ese número, intenta de nuevo');
      }
      throw e;
    }

    for (const item of despacho.items) {
      await this.ajustarReserva(tx, item.productoId, dto.almacenId, Number(item.cantidad));
    }

    return despacho;
  }

  async update(empresaId: string, id: string, dto: UpdateDespachoDto) {
    const despacho = await this.findOne(empresaId, id);
    if (['DESPACHADO', 'ENTREGADO', 'CANCELADO'].includes(despacho.estado)) {
      throw new ForbiddenException(`No se puede modificar un despacho en estado ${despacho.estado}`);
    }
    if (dto.transportistaId) await this.validarTransportista(empresaId, dto.transportistaId);

    return this.prisma.withTenant(empresaId, (tx) =>
      this.actualizarConManejoP2025(tx, id, {
        ...(dto.fechaEntrega !== undefined && { fechaEntrega: new Date(dto.fechaEntrega) }),
        ...(dto.direccionEntrega !== undefined && { direccionEntrega: dto.direccionEntrega }),
        ...(dto.transportistaId !== undefined && { transportistaId: dto.transportistaId }),
        ...(dto.observaciones !== undefined && { observaciones: dto.observaciones }),
      }),
    );
  }

  private async actualizarConManejoP2025(tx: PrismaClient, id: string, data: any) {
    try {
      return await tx.despacho.update({
        where: { id },
        data,
        include: { items: true },
      });
    } catch (e: any) {
      if (e.code === 'P2025') {
        throw new NotFoundException('Despacho no encontrado');
      }
      throw e;
    }
  }

  // ── Máquina de estados: PEDIDO -> APROBADO -> PICKING -> LISTO -> DESPACHADO -> ENTREGADO ──

  aprobar(empresaId: string, id: string) {
    return this.transicionSimple(empresaId, id, ['PEDIDO'], 'APROBADO');
  }

  iniciarPicking(empresaId: string, id: string) {
    return this.transicionSimple(empresaId, id, ['APROBADO'], 'PICKING');
  }

  marcarListo(empresaId: string, id: string) {
    return this.transicionSimple(empresaId, id, ['PICKING'], 'LISTO');
  }

  /** LISTO -> DESPACHADO. Genera Movimientos SALIDA reales y libera la reserva. */
  async despachar(empresaId: string, id: string, dto: DespacharDto = {}) {
    return this.prisma.withTenant(empresaId, (tx) =>
      this.despacharEnTransaccion(tx, empresaId, id, dto),
    );
  }

  /**
   * Misma lógica que despachar(), pero recibe un `tx` ya abierto — usado por
   * RutasService.iniciar() para despachar TODOS los despachos de una ruta
   * en una sola transacción atómica (decisión de Fase 5).
   */
  async despacharEnTransaccion(tx: PrismaClient, empresaId: string, id: string, dto: DespacharDto = {}) {
    const despacho = await tx.despacho.findFirst({ where: { id, empresaId }, include: { items: true } });
    if (!despacho) throw new NotFoundException('Despacho no encontrado');
    if (despacho.estado !== 'LISTO') {
      throw new ForbiddenException(
        `Solo se puede despachar un pedido en estado LISTO (actual: ${despacho.estado})`,
      );
    }

    for (const item of despacho.items) {
      // Convierte la reserva en un Movimiento SALIDA real (motor de Fase 3).
      await this.movimientosService.crearEnTransaccion(tx, empresaId, {
        tipo: TipoMovimiento.SALIDA,
        productoId: item.productoId,
        almacenId: despacho.almacenId,
        cantidad: Number(item.cantidad),
        costoUnitario: item.costoUnitario != null ? Number(item.costoUnitario) : undefined,
        motivo: `Despacho ${despacho.numero}`,
        documento: despacho.numero,
      } as any);

      // Libera la reserva — ya se convirtió en salida real, deja de estar "comprometida".
      await this.ajustarReserva(tx, item.productoId, despacho.almacenId, -Number(item.cantidadReservada));
      await tx.despachoItem.update({ where: { id: item.id }, data: { cantidadReservada: 0 } });
    }

    return tx.despacho.update({
      where: { id },
      data: {
        estado: 'DESPACHADO',
        fechaDespacho: new Date(),
        ...(dto.guiaNumero && { guiaNumero: dto.guiaNumero }),
      },
      include: { items: true },
    });
  }

  /**
   * Asigna guiaNumero a un despacho que ya salió sin ella — cierra el gap de los despachos
   * despachados vía Ruta (RutasService.iniciar() no pide guía por parada, ver Transportes.jsx).
   * Rechaza si ya tiene una guía asignada, para no pisarla por error.
   */
  async asignarGuia(empresaId: string, id: string, guiaNumero: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const despacho = await tx.despacho.findFirst({ where: { id, empresaId } });
      if (!despacho) throw new NotFoundException('Despacho no encontrado');
      if (!['DESPACHADO', 'ENTREGADO'].includes(despacho.estado)) {
        throw new ForbiddenException(
          `Solo se puede asignar guía a un despacho DESPACHADO o ENTREGADO (actual: ${despacho.estado})`,
        );
      }
      if (despacho.guiaNumero) {
        throw new BadRequestException(`Este despacho ya tiene guía asignada: ${despacho.guiaNumero}`);
      }
      return tx.despacho.update({ where: { id }, data: { guiaNumero }, include: { items: true } });
    });
  }

  /** DESPACHADO -> ENTREGADO (confirmación de recepción del cliente — sin efecto en stock). */
  async entregar(empresaId: string, id: string, dto: EntregarDto = {}) {
    return this.prisma.withTenant(empresaId, (tx) => this.entregarEnTransaccion(tx, empresaId, id, dto));
  }

  /** Misma lógica, pero con `tx` ya abierto — usado por RutasService al marcar una parada ENTREGADO. */
  async entregarEnTransaccion(tx: PrismaClient, empresaId: string, id: string, dto: EntregarDto = {}) {
    const despacho = await tx.despacho.findFirst({ where: { id, empresaId } });
    if (!despacho) throw new NotFoundException('Despacho no encontrado');
    if (despacho.estado !== 'DESPACHADO') {
      throw new ForbiddenException(
        `Solo se puede marcar ENTREGADO un despacho en estado DESPACHADO (actual: ${despacho.estado})`,
      );
    }
    return tx.despacho.update({
      where: { id },
      data: {
        estado: 'ENTREGADO',
        fechaEntregado: new Date(),
        ...(dto.receptorNombre !== undefined && { receptorNombre: dto.receptorNombre }),
        ...(dto.evidenciaFoto !== undefined && { evidenciaFoto: dto.evidenciaFoto }),
        ...(dto.evidenciaNotas !== undefined && { evidenciaNotas: dto.evidenciaNotas }),
      },
    });
  }

  /** Cancela y libera CUALQUIER reserva pendiente — solo antes de DESPACHADO. */
  async cancelar(empresaId: string, id: string) {
    const despacho = await this.findOne(empresaId, id);
    if (!['PEDIDO', 'APROBADO', 'PICKING', 'LISTO'].includes(despacho.estado)) {
      throw new ForbiddenException(`No se puede cancelar un despacho en estado ${despacho.estado}`);
    }

    return this.prisma.withTenant(empresaId, async (tx) => {
      for (const item of despacho.items) {
        if (Number(item.cantidadReservada) > 0) {
          await this.ajustarReserva(tx, item.productoId, despacho.almacenId, -Number(item.cantidadReservada));
          await tx.despachoItem.update({ where: { id: item.id }, data: { cantidadReservada: 0 } });
        }
      }
      return tx.despacho.update({
        where: { id },
        data: { estado: 'CANCELADO' },
        include: { items: true },
      });
    });
  }

  // ── Helpers ──

  private async transicionSimple(
    empresaId: string,
    id: string,
    desde: string[],
    hacia: string,
  ) {
    const despacho = await this.findOne(empresaId, id);
    if (!desde.includes(despacho.estado)) {
      throw new ForbiddenException(`No se puede pasar de ${despacho.estado} a ${hacia}`);
    }
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.despacho.update({ where: { id }, data: { estado: hacia as any }, include: { items: true } }),
    );
  }

  /**
   * Disponible = stock TOTAL del almacén (bucket sin asignar + todas las
   * ubicaciones del Mapa de Almacén) menos lo ya reservado por OTROS
   * despachos (la reserva vive únicamente en el bucket sin asignar).
   */
  private async disponible(empresaId: string, productoId: string, almacenId: string): Promise<number> {
    const filas = await this.prisma.withTenant(empresaId, (tx) =>
      tx.inventario.findMany({ where: { productoId, almacenId } }),
    );
    return calcularDisponibleTotal(filas);
  }

  /** Mismo patrón que aplicarDeltaInventario en MovimientosService — sin upsert() por el null en ubicacionId. */
  private async ajustarReserva(tx: PrismaClient, productoId: string, almacenId: string, delta: number) {
    const existente = await tx.inventario.findFirst({
      where: { productoId, almacenId, ubicacionId: null },
    });
    if (existente) {
      return tx.inventario.update({
        where: { id: existente.id },
        data: { cantidadReservada: { increment: delta } },
      });
    }
    return tx.inventario.create({
      data: { productoId, almacenId, ubicacionId: null, cantidad: 0, cantidadReservada: delta },
    });
  }

  private validarCliente(empresaId: string, clienteId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.cliente.findFirst({ where: { id: clienteId, empresaId } })),
      'El cliente indicado no existe o no pertenece a esta empresa',
    );
  }

  private validarAlmacen(empresaId: string, almacenId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.almacen.findFirst({ where: { id: almacenId, empresaId } })),
      'El almacén indicado no existe o no pertenece a esta empresa',
    );
  }

  private validarTransportista(empresaId: string, transportistaId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.transportista.findFirst({ where: { id: transportistaId, empresaId } })),
      'El transportista indicado no existe o no pertenece a esta empresa',
    );
  }

  private validarProducto(empresaId: string, productoId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.producto.findFirst({ where: { id: productoId, empresaId } })),
      `El producto ${productoId} no existe o no pertenece a esta empresa`,
    );
  }
}
