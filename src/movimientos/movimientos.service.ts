import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient, TipoMovimiento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMovimientoDto } from './dto/create-movimiento.dto';
import {
  calcularDisponibleTotal,
  deltaEnAlmacenDesdeMovimiento,
  deltaTotalDesdeMovimiento,
  prepararMovimiento,
} from './stock-impacto.util';
import { crearCapaEntrada } from './capas-costo.util';

@Injectable()
export class MovimientosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea un Movimiento y, en la MISMA transacción, actualiza Inventario,
   * Producto.stockActual y (si aplica) LoteProducto.cantidadActual.
   * Movimiento es el libro único — nunca se edita ni se borra después de
   * creado; una corrección se asienta con un AJUSTE nuevo.
   *
   * La validación de "mismo almacén origen/destino" se hace ANTES de abrir
   * la transacción (fail-fast): no tiene sentido pagar el costo de un BEGIN
   * en Postgres para una request que ya sabemos inválida sin tocar la BD.
   */
  async create(empresaId: string, dto: CreateMovimientoDto) {
    if (dto.tipo === 'TRANSFERENCIA' && dto.almacenDestinoId === dto.almacenId) {
      throw new BadRequestException(
        'El almacén origen y destino no pueden ser el mismo (regla de Transferencia)',
      );
    }
    return this.prisma.withTenant(empresaId, (tx) =>
      this.crearEnTransaccion(tx, empresaId, dto),
    );
  }

  /**
   * Misma lógica que create(), pero recibe un `tx` ya abierto por OTRO
   * service (ej. OrdenesCompraService al recibir mercadería — Fase 4)
   * para que el Movimiento y el cambio de estado de la Orden de Compra
   * queden en una sola transacción atómica. Repite la validación de
   * TRANSFERENCIA por defensa en profundidad (si en el futuro algún otro
   * caller llega a pasar ese tipo directamente con un tx ya abierto).
   */
  async crearEnTransaccion(tx: PrismaClient, empresaId: string, dto: CreateMovimientoDto) {
    if (dto.tipo === 'TRANSFERENCIA' && dto.almacenDestinoId === dto.almacenId) {
      throw new BadRequestException(
        'El almacén origen y destino no pueden ser el mismo (regla de Transferencia)',
      );
    }

    const producto = await tx.producto.findFirst({ where: { id: dto.productoId, empresaId } });
    if (!producto) {
      throw new BadRequestException('El producto indicado no existe o no pertenece a esta empresa');
    }

    const almacen = await tx.almacen.findFirst({ where: { id: dto.almacenId, empresaId } });
    if (!almacen) {
      throw new BadRequestException('El almacén indicado no existe o no pertenece a esta empresa');
    }

    if (dto.tipo === 'TRANSFERENCIA') {
      const destino = await tx.almacen.findFirst({ where: { id: dto.almacenDestinoId, empresaId } });
      if (!destino) {
        throw new BadRequestException('El almacén destino no existe o no pertenece a esta empresa');
      }
    }

    let lote: { id: string; numero: string; cantidadActual: any } | null = null;
    if (dto.loteId) {
      lote = await tx.loteProducto.findFirst({
        where: { id: dto.loteId, productoId: dto.productoId },
      });
      if (!lote) {
        throw new BadRequestException('El lote indicado no existe o no pertenece a este producto');
      }
    }

    const impacto = prepararMovimiento(dto.tipo, dto.cantidad, dto.direccion);

    if (impacto.deltaOrigen < 0) {
      if (lote) {
        const disponibleLote = Number(lote.cantidadActual);
        if (disponibleLote + impacto.deltaOrigen < 0) {
          throw new BadRequestException(
            `Stock insuficiente en el lote ${lote.numero}: disponible ${disponibleLote}, se requieren ${Math.abs(impacto.deltaOrigen)}`,
          );
        }
      }

      // Descuenta contra el stock TOTAL del almacén (bucket sin asignar +
      // todo lo guardado en ubicaciones del Mapa de Almacén), no solo el
      // bucket sin asignar — de lo contrario el usuario ve stock disponible
      // en Inventario que la validación rechaza igual.
      await this.descontarStockMultiUbicacion(
        tx,
        dto.productoId,
        dto.almacenId,
        Math.abs(impacto.deltaOrigen),
      );
    } else if (impacto.deltaOrigen > 0) {
      await this.aplicarDeltaInventario(tx, dto.productoId, dto.almacenId, impacto.deltaOrigen);
    }

    if (dto.tipo === 'TRANSFERENCIA') {
      await this.aplicarDeltaInventario(tx, dto.productoId, dto.almacenDestinoId!, impacto.deltaDestino);
    }

    await tx.producto.update({
      where: { id: dto.productoId },
      data: { stockActual: { increment: impacto.deltaTotal } },
    });

    if (dto.loteId) {
      await tx.loteProducto.update({
        where: { id: dto.loteId },
        data: { cantidadActual: { increment: impacto.deltaTotal } },
      });
    }

    const movimiento = await tx.movimiento.create({
      data: {
        empresaId,
        tipo: dto.tipo,
        productoId: dto.productoId,
        loteId: dto.loteId,
        almacenId: dto.almacenId,
        almacenDestinoId: dto.tipo === 'TRANSFERENCIA' ? dto.almacenDestinoId : null,
        cantidad: impacto.cantidadAlmacenada,
        costoUnitario: dto.costoUnitario,
        motivo: dto.motivo,
        documento: dto.documento,
      },
    });

    // Capas de costo (Fase 2 del motor de valorización) — solo en entradas
    // netas de stock (ENTRADA, DEVOLUCION de cliente, AJUSTE-incremento) y
    // solo si la empresa activó el kill-switch de rollout. Mientras esté
    // apagado (default), esto no ejecuta nada — cero cambio de comportamiento.
    if (impacto.deltaTotal > 0) {
      const empresa = await tx.empresa.findUnique({
        where: { id: empresaId },
        select: { costeoAutomatico: true },
      });
      if (empresa?.costeoAutomatico) {
        await crearCapaEntrada(tx, {
          empresaId,
          productoId: dto.productoId,
          loteId: dto.loteId,
          movimientoId: movimiento.id,
          cantidad: impacto.deltaTotal,
          costoUnitario: dto.costoUnitario as unknown as number,
        });
      }
    }

    return movimiento;
  }

  findAll(
    empresaId: string,
    filtros: {
      productoId?: string;
      almacenId?: string;
      tipo?: TipoMovimiento;
      desde?: string;
      hasta?: string;
    } = {},
  ) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.movimiento.findMany({
        where: {
          empresaId,
          ...(filtros.productoId && { productoId: filtros.productoId }),
          ...(filtros.almacenId && {
            OR: [{ almacenId: filtros.almacenId }, { almacenDestinoId: filtros.almacenId }],
          }),
          ...(filtros.tipo && { tipo: filtros.tipo }),
          ...((filtros.desde || filtros.hasta) && {
            fecha: {
              ...(filtros.desde && { gte: new Date(filtros.desde) }),
              ...(filtros.hasta && { lte: new Date(filtros.hasta) }),
            },
          }),
        },
        include: {
          producto: { select: { sku: true, nombre: true } },
          almacen: { select: { nombre: true } },
        },
        orderBy: { fecha: 'desc' },
        take: 500,
      }),
    );
  }

  async findOne(empresaId: string, id: string) {
    const movimiento = await this.prisma.withTenant(empresaId, (tx) =>
      tx.movimiento.findFirst({ where: { id, empresaId } }),
    );
    if (!movimiento) throw new NotFoundException('Movimiento no encontrado');
    return movimiento;
  }

  /** Kardex — saldo corrido calculado sobre la tabla Movimiento unificada. */
  async kardex(
    empresaId: string,
    productoId: string,
    almacenId?: string,
    desde?: string,
    hasta?: string,
  ) {
    const movimientos = await this.prisma.withTenant(empresaId, (tx) =>
      tx.movimiento.findMany({
        where: {
          empresaId,
          productoId,
          ...(almacenId && { OR: [{ almacenId }, { almacenDestinoId: almacenId }] }),
          ...((desde || hasta) && {
            fecha: {
              ...(desde && { gte: new Date(desde) }),
              ...(hasta && { lte: new Date(hasta) }),
            },
          }),
        },
        orderBy: { fecha: 'asc' },
      }),
    );

    let saldo = 0;
    return movimientos.map((m) => {
      const cantidad = Number(m.cantidad);
      const delta = almacenId
        ? deltaEnAlmacenDesdeMovimiento(m.tipo, cantidad, m.almacenId, m.almacenDestinoId, almacenId)
        : deltaTotalDesdeMovimiento(m.tipo, cantidad);
      saldo += delta;
      return { ...m, delta, saldoAcumulado: saldo };
    });
  }

  /**
   * Descuenta `cantidadRequerida` del stock de un producto en un almacén,
   * considerando TODAS las filas de Inventario (bucket sin asignar +
   * ubicaciones del Mapa de Almacén) como un único total disponible.
   * Se descuenta primero del bucket sin asignar (respetando lo reservado
   * por Despachos, que solo reserva ahí) y luego, si falta, de las
   * ubicaciones específicas en el orden en que se leyeron.
   */
  private async descontarStockMultiUbicacion(
    tx: PrismaClient,
    productoId: string,
    almacenId: string,
    cantidadRequerida: number,
  ) {
    const filas = await tx.inventario.findMany({ where: { productoId, almacenId } });

    const bucketNull = filas.find((f: any) => f.ubicacionId === null);
    const disponibleNull = bucketNull
      ? Number(bucketNull.cantidad) - Number(bucketNull.cantidadReservada)
      : 0;
    const filasUbicadas = filas.filter((f: any) => f.ubicacionId !== null);
    const disponibleTotal = calcularDisponibleTotal(filas);

    if (disponibleTotal < cantidadRequerida) {
      throw new BadRequestException(
        `Stock insuficiente en el almacén: disponible ${disponibleTotal}, se requieren ${cantidadRequerida}`,
      );
    }

    let restante = cantidadRequerida;

    const delNull = Math.min(restante, disponibleNull);
    if (delNull > 0 && bucketNull) {
      await tx.inventario.update({
        where: { id: bucketNull.id },
        data: { cantidad: { decrement: delNull } },
      });
      restante -= delNull;
    }

    for (const fila of filasUbicadas) {
      if (restante <= 0) break;
      const delFila = Math.min(restante, Number(fila.cantidad));
      if (delFila <= 0) continue;
      await tx.inventario.update({
        where: { id: fila.id },
        data: { cantidad: { decrement: delFila } },
      });
      restante -= delFila;
    }
  }

  private async aplicarDeltaInventario(
    tx: PrismaClient,
    productoId: string,
    almacenId: string,
    delta: number,
  ) {
    const existente = await tx.inventario.findFirst({
      where: { productoId, almacenId, ubicacionId: null },
    });
    if (existente) {
      return tx.inventario.update({
        where: { id: existente.id },
        data: { cantidad: { increment: delta } },
      });
    }
    return tx.inventario.create({
      data: { productoId, almacenId, ubicacionId: null, cantidad: delta },
    });
  }
}
