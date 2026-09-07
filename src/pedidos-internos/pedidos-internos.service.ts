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
import { calcularDisponibleTotal } from '../movimientos/stock-impacto.util';

@Injectable()
export class PedidosInternosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movimientosService: MovimientosService,
  ) {}

  findAll(empresaId: string, filtros: { areaId?: string; estado?: string; proyectoId?: string } = {}) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.pedidoInterno.findMany({
        where: {
          empresaId,
          ...(filtros.areaId && { areaId: filtros.areaId }),
          ...(filtros.estado && { estado: validarEnum(filtros.estado, Object.values(EstadoPedidoInterno)) }),
          ...(filtros.proyectoId && { proyectoId: filtros.proyectoId }),
        },
        include: {
          items: true,
          area: { select: { nombre: true, codigo: true } },
          // Nombres para el timeline de trazabilidad — el detalle en el frontend
          // reutiliza estos mismos objetos ya cargados en la lista, sin una
          // llamada aparte a /usuarios (el rol 'solicitante' no tiene ese permiso).
          usuarioSolicita: { select: { nombre: true } },
          usuarioAprueba: { select: { nombre: true } },
          usuarioEntrega: { select: { nombre: true } },
          proyecto: { select: { id: true, codigo: true, nombre: true } },
        },
        orderBy: { fecha: 'desc' },
        take: 500,
      }),
    );
  }

  /** Ver nota en el controller — catálogo mínimo, sin costos ni stock. */
  productosDisponibles(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.producto.findMany({
        where: { empresaId, estado: 'Activo' },
        select: { id: true, sku: true, nombre: true, unidadMedida: true },
        orderBy: { nombre: 'asc' },
      }),
    );
  }

  async findOne(empresaId: string, id: string) {
    const pedido = await this.prisma.withTenant(empresaId, (tx) =>
      tx.pedidoInterno.findFirst({
        where: { id, empresaId },
        include: { items: true, proyecto: { select: { id: true, codigo: true, nombre: true } } },
      }),
    );
    if (!pedido) throw new NotFoundException('Pedido interno no encontrado');
    return pedido;
  }

  /** Siempre crea en BORRADOR — enviar() es una transición explícita aparte. */
  async create(empresaId: string, usuarioSolicitaId: string, dto: CreatePedidoInternoDto) {
    await this.validarArea(empresaId, dto.areaId);
    await this.validarAlmacen(empresaId, dto.almacenId);
    if (dto.proyectoId) await this.validarProyecto(empresaId, dto.proyectoId);
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
            proyectoId: dto.proyectoId,
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
    if (dto.proyectoId) await this.validarProyecto(empresaId, dto.proyectoId);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.pedidoInterno.update({
        where: { id },
        data: {
          ...(dto.fechaRequerida !== undefined && { fechaRequerida: new Date(dto.fechaRequerida) }),
          ...(dto.prioridad !== undefined && { prioridad: dto.prioridad }),
          ...(dto.notasSolicitud !== undefined && { notasSolicitud: dto.notasSolicitud }),
          ...(dto.proyectoId !== undefined && { proyectoId: dto.proyectoId }),
        },
        include: { items: true },
      }),
    );
  }

  /** BORRADOR -> ENVIADO. */
  async enviar(empresaId: string, id: string) {
    return this.transicionSimple(empresaId, id, ['BORRADOR'], 'ENVIADO', { fechaEnvio: new Date() });
  }

  /**
   * ENVIADO -> APROBADO. Chequeo fail-fast: evita aprobar (y que Almacén
   * empiece a preparar) un pedido que ya se ve inviable en este momento —
   * pero NO reemplaza el chequeo de entregar(): Pedidos Internos no reserva
   * stock en ningún paso, así que lo disponible aquí puede no seguir estando
   * disponible más adelante (otro pedido/despacho de por medio). El chequeo
   * de entregar() sigue siendo el autoritativo.
   */
  async aprobar(empresaId: string, id: string, usuarioApruebaId: string, dto: AprobarPedidoDto) {
    const pedido = await this.findOne(empresaId, id);
    if (pedido.estado !== 'ENVIADO') {
      throw new ForbiddenException(`No se puede aprobar un pedido en estado ${pedido.estado}`);
    }
    await this.validarStockDisponible(empresaId, pedido);
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
          fechaRechazo: new Date(),
          usuarioApruebaId,
          motivoRechazo: dto.motivo,
        },
        include: { items: true },
      }),
    );
  }

  /** APROBADO -> PICKING. */
  async marcarPicking(empresaId: string, id: string) {
    return this.transicionSimple(empresaId, id, ['APROBADO'], 'PICKING', { fechaPicking: new Date() });
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

    // Valida el stock de TODOS los ítems antes de mutar nada — evita que un
    // for con await corte el loop en el primer faltante (dejando movimientos
    // ya aplicados y sin informar el resto de los productos con stock corto).
    await this.validarStockDisponible(empresaId, pedido);

    return this.prisma.withTenant(empresaId, async (tx) => {
      // A diferencia de OC/Despacho, PedidoInternoItem no captura un costo
      // propio (nunca hay pricing en un pedido interno) — así que el costo
      // de la SALIDA se toma de Producto.precioCompra vigente al momento de
      // entregar. Sin esto, el Movimiento queda con costoUnitario null y el
      // reporte de Consumo por Proyecto (que existe justamente para
      // valorizar esto) muestra S/0.00 aunque sí haya movimientos.
      const productos = await tx.producto.findMany({
        where: { id: { in: pedido.items.map((i) => i.productoId) } },
        select: { id: true, precioCompra: true },
      });
      const costoPorId = new Map(productos.map((p) => [p.id, p.precioCompra]));

      for (const item of pedido.items) {
        const costo = costoPorId.get(item.productoId);
        await this.movimientosService.crearEnTransaccion(tx, empresaId, {
          tipo: TipoMovimiento.SALIDA,
          productoId: item.productoId,
          almacenId: pedido.almacenId,
          cantidad: Number(item.cantidad),
          costoUnitario: costo != null ? Number(costo) : undefined,
          motivo: `Pedido interno ${pedido.numero}`,
          documento: pedido.numero,
          // Gestión de Pedidos por Proyecto (2026-09-04) — el consumo real
          // (esta SALIDA) queda etiquetado con el proyecto del pedido de
          // origen, si tenía uno asignado. `undefined` cuando no, así el
          // Movimiento resultante no toca ese campo (queda null).
          proyectoId: pedido.proyectoId ?? undefined,
          pedidoInternoId: pedido.id,
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

  private async transicionSimple(
    empresaId: string,
    id: string,
    desde: string[],
    hacia: string,
    extraData: Record<string, unknown> = {},
  ) {
    const pedido = await this.findOne(empresaId, id);
    if (!desde.includes(pedido.estado)) {
      throw new ForbiddenException(`No se puede pasar de ${pedido.estado} a ${hacia}`);
    }
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.pedidoInterno.update({
        where: { id },
        data: { estado: hacia as any, ...extraData },
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

  private validarProyecto(empresaId: string, proyectoId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.proyecto.findFirst({ where: { id: proyectoId, empresaId } })),
      'El proyecto indicado no existe o no pertenece a esta empresa',
    );
  }

  private validarProducto(empresaId: string, productoId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.producto.findFirst({ where: { id: productoId, empresaId } })),
      `El producto ${productoId} no existe o no pertenece a esta empresa`,
    );
  }

  /** Mismo criterio que MovimientosService/DespachosService: bucket sin asignar + ubicaciones del Mapa de Almacén. */
  private async disponible(empresaId: string, productoId: string, almacenId: string): Promise<number> {
    const filas = await this.prisma.withTenant(empresaId, (tx) =>
      tx.inventario.findMany({ where: { productoId, almacenId } }),
    );
    return calcularDisponibleTotal(filas);
  }

  /**
   * Verifica que el almacén del pedido tenga stock suficiente para TODOS sus
   * ítems — compartido por aprobar() (fail-fast) y entregar() (autoritativo,
   * ver nota en aprobar()). Junta todos los faltantes antes de lanzar, para
   * no informar solo el primer producto corto.
   */
  private async validarStockDisponible(
    empresaId: string,
    pedido: { almacenId: string; items: { productoId: string; cantidad: unknown }[] },
  ) {
    const productos = await this.prisma.withTenant(empresaId, (tx) =>
      tx.producto.findMany({
        where: { id: { in: pedido.items.map((i) => i.productoId) } },
        select: { id: true, nombre: true },
      }),
    );
    const nombrePorId = new Map(productos.map((p) => [p.id, p.nombre]));

    const faltantes: string[] = [];
    for (const item of pedido.items) {
      const disponible = await this.disponible(empresaId, item.productoId, pedido.almacenId);
      const requerido = Number(item.cantidad);
      if (disponible < requerido) {
        const nombre = nombrePorId.get(item.productoId) ?? item.productoId;
        faltantes.push(`${nombre}: disponible ${disponible}, se requieren ${requerido}`);
      }
    }
    if (faltantes.length > 0) {
      throw new BadRequestException(
        `Stock insuficiente en el almacén para:\n- ${faltantes.join('\n- ')}`,
      );
    }
  }
}
