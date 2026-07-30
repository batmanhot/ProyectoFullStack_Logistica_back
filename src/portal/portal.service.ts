import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { EstadoPedidoPortal } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DespachosService } from '../despachos/despachos.service';
import { CrearPedidoPortalDto } from './dto/crear-pedido-portal.dto';
import { AprobarPedidoPortalDto } from './dto/aprobar-pedido-portal.dto';
import { RechazarPedidoPortalDto } from './dto/rechazar-pedido-portal.dto';
import { validarEnum } from '../common/utils/validar-enum.util';

const IGV_RATE = 0.18;
const ESTADOS_DESPACHO_VISIBLES = ['PEDIDO', 'APROBADO', 'PICKING', 'LISTO', 'DESPACHADO', 'ENTREGADO'];

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly despachosService: DespachosService,
  ) {}

  // ── Generación de link (acción de un Usuario admin, JWT de tenant normal) ──

  /**
   * Reemplaza el token inseguro del frontend viejo (btoa(clienteId:ruc))
   * por un JWT firmado de larga duración con su PROPIO secreto.
   *
   * Hallazgo Alto #10 (auditoría 2026-07-29): regenerar el link ahora
   * incrementa Cliente.portalTokenVersion — revoca de inmediato cualquier
   * link anterior (por ejemplo, si el que se envió por WhatsApp se filtró),
   * ya que PortalClienteGuard valida el `tokenVersion` embebido contra el
   * valor actual en la base de datos.
   */
  async generarLink(empresaId: string, clienteId: string) {
    // Ownership explícito en el WHERE (no solo RLS) — mismo criterio que el
    // resto del código tras la auditoría 2026-07-29 (Hallazgos Críticos #2/#3).
    const cliente = await this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.cliente.findFirst({ where: { id: clienteId, empresaId } });
      if (!existente) return null;
      return tx.cliente.update({
        where: { id: clienteId },
        data: { portalTokenVersion: { increment: 1 } },
      });
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    const empresa = await this.prisma.empresa.findUnique({ where: { id: empresaId }, select: { nombre: true } });

    const options: JwtSignOptions = {
      secret: process.env.PORTAL_JWT_SECRET,
      expiresIn: (process.env.PORTAL_JWT_EXPIRES_IN ?? '365d') as JwtSignOptions['expiresIn'],
    };
    const token = await this.jwt.signAsync(
      {
        sub: cliente.id,
        empresaId,
        scope: 'portal_cliente',
        clienteNombre: cliente.razonSocial,
        empresaNombre: empresa?.nombre,
        tokenVersion: cliente.portalTokenVersion,
      },
      options,
    );
    return { token, clienteId: cliente.id, clienteNombre: cliente.razonSocial };
  }

  // ── Cliente-facing (vía PortalClienteGuard) ──────────────────────

  /** Catálogo del portal — productos activos con precio de venta publicado. */
  catalogo(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.producto.findMany({
        where: { empresaId, estado: 'Activo', precioVenta: { gt: 0 } },
        select: { id: true, sku: true, nombre: true, unidadMedida: true, precioVenta: true },
        orderBy: { nombre: 'asc' },
      }),
    );
  }

  /** Despachos del propio cliente — solo lectura, excluye CANCELADO. */
  misDespachos(empresaId: string, clienteId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.despacho.findMany({
        where: { empresaId, clienteId, estado: { in: ESTADOS_DESPACHO_VISIBLES as any } },
        include: { items: true },
        orderBy: { fecha: 'desc' },
      }),
    );
  }

  /** Historial propio de pedidos enviados vía portal. */
  misPedidos(empresaId: string, clienteId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.pedidoPortal.findMany({
        where: { empresaId, clienteId },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  /** Crea un nuevo PedidoPortal — snapshot del precio al momento del pedido. */
  async crearPedido(empresaId: string, clienteId: string, dto: CrearPedidoPortalDto) {
    const productos = await this.prisma.withTenant(empresaId, (tx) =>
      tx.producto.findMany({
        where: { empresaId, id: { in: dto.items.map((i) => i.productoId) }, estado: 'Activo' },
      }),
    );
    if (productos.length !== dto.items.length) {
      throw new BadRequestException('Uno o más productos no existen, no están activos o no pertenecen a esta empresa');
    }

    const itemsConPrecio = dto.items.map((item) => {
      const producto = productos.find((p) => p.id === item.productoId)!;
      const precioUnitario = Number(producto.precioVenta ?? 0);
      if (precioUnitario <= 0) {
        throw new BadRequestException(`El producto ${producto.nombre} no tiene precio de venta publicado`);
      }
      return { ...item, precioUnitario, subtotal: item.cantidad * precioUnitario };
    });

    const subtotal = itemsConPrecio.reduce((s, i) => s + i.subtotal, 0);
    const igv = Math.round(subtotal * IGV_RATE * 100) / 100;
    const total = subtotal + igv;

    return this.prisma.withTenant(empresaId, async (tx) => {
      const cantidadPrevia = await tx.pedidoPortal.count({ where: { empresaId } });
      const numero = `PPE-${String(cantidadPrevia + 1).padStart(5, '0')}`;

      return tx.pedidoPortal.create({
        data: {
          empresaId,
          numero,
          clienteId,
          subtotal,
          igv,
          total,
          observaciones: dto.observaciones,
          fechaEntregaDeseada: dto.fechaEntregaDeseada ? new Date(dto.fechaEntregaDeseada) : null,
          items: { create: itemsConPrecio },
        },
        include: { items: true },
      });
    });
  }

  // ── Admin-facing (JWT de tenant normal) ──────────────────────────

  findAllAdmin(empresaId: string, filtros: { estado?: string } = {}) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.pedidoPortal.findMany({
        where: { empresaId, ...(filtros.estado && { estado: validarEnum(filtros.estado, Object.values(EstadoPedidoPortal)) }) },
        include: { items: true, cliente: { select: { razonSocial: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async findOneAdmin(empresaId: string, id: string) {
    const pedido = await this.prisma.withTenant(empresaId, (tx) =>
      tx.pedidoPortal.findFirst({ where: { id, empresaId }, include: { items: true } }),
    );
    if (!pedido) throw new NotFoundException('Pedido del portal no encontrado');
    return pedido;
  }

  /**
   * Aprueba y convierte en un Despacho REAL vía DespachosService.create()
   * (con reserva de stock real, Fase 5) — el frontend viejo hacía un
   * storage.saveDespacho() manual que no pasaba por el motor de stock.
   */
  /**
   * Crea el Despacho y marca el PedidoPortal como CONVERTIDO en una única
   * transacción — antes eran dos transacciones separadas (DespachosService.create()
   * committeaba la suya antes de que esta actualizara el pedido), así que si el
   * segundo paso fallaba quedaba un Despacho huérfano con stock ya reservado, y
   * un reintento del admin podía duplicarlo (el pedido seguía en NUEVO).
   */
  async aprobarYConvertir(empresaId: string, id: string, dto: AprobarPedidoPortalDto) {
    const pedido = await this.findOneAdmin(empresaId, id);
    if (pedido.estado !== 'NUEVO') {
      throw new ForbiddenException(`No se puede aprobar un pedido del portal en estado ${pedido.estado}`);
    }

    const despachoDto = {
      clienteId: pedido.clienteId,
      almacenId: dto.almacenId,
      fechaEntrega: pedido.fechaEntregaDeseada?.toISOString(),
      observaciones: pedido.observaciones ?? undefined,
      items: pedido.items.map((i) => ({
        productoId: i.productoId,
        cantidad: Number(i.cantidad),
        precioVenta: Number(i.precioUnitario),
      })),
    } as any;

    await this.despachosService.validarParaCrear(empresaId, despachoDto);

    return this.prisma.withTenant(empresaId, async (tx) => {
      const despacho = await this.despachosService.crearEnTransaccion(tx, empresaId, despachoDto);
      return tx.pedidoPortal.update({
        where: { id },
        data: { estado: 'CONVERTIDO', despachoId: despacho.id },
        include: { items: true },
      });
    });
  }

  async rechazar(empresaId: string, id: string, dto: RechazarPedidoPortalDto) {
    const pedido = await this.findOneAdmin(empresaId, id);
    if (pedido.estado !== 'NUEVO') {
      throw new ForbiddenException(`No se puede rechazar un pedido del portal en estado ${pedido.estado}`);
    }
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.pedidoPortal.update({
        where: { id },
        data: { estado: 'RECHAZADO', motivoRechazo: dto.motivo },
        include: { items: true },
      }),
    );
  }
}
