import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFacturaB2BDto } from '../facturas-b2b/dto/create-factura-b2b.dto';

@Injectable()
export class PortalProveedorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // ── Generación de link (acción de un Usuario admin, JWT de tenant normal) ──

  /**
   * Mismo patrón que PortalService.generarLink() pero scope 'portal_proveedor'.
   * Hallazgo Alto #10 (auditoría 2026-07-29): regenerar el link incrementa
   * Proveedor.portalTokenVersion, revocando de inmediato cualquier link anterior.
   */
  async generarLink(empresaId: string, proveedorId: string) {
    const proveedor = await this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.proveedor.findFirst({ where: { id: proveedorId, empresaId } });
      if (!existente) return null;
      return tx.proveedor.update({
        where: { id: proveedorId },
        data: { portalTokenVersion: { increment: 1 } },
      });
    });
    if (!proveedor) throw new NotFoundException('Proveedor no encontrado');

    const options: JwtSignOptions = {
      secret: process.env.PORTAL_JWT_SECRET,
      expiresIn: (process.env.PORTAL_JWT_EXPIRES_IN ?? '365d') as JwtSignOptions['expiresIn'],
    };
    const token = await this.jwt.signAsync(
      {
        sub: proveedor.id,
        empresaId,
        scope: 'portal_proveedor',
        proveedorNombre: proveedor.razonSocial,
        tokenVersion: proveedor.portalTokenVersion,
      },
      options,
    );
    return { token, proveedorId: proveedor.id, proveedorNombre: proveedor.razonSocial };
  }

  // ── Proveedor-facing (vía PortalProveedorGuard) ──────────────────

  /** OC del proveedor autenticado, con items enriquecidos con datos del producto (no hay tenant JWT para consultarlos aparte). */
  misOrdenes(empresaId: string, proveedorId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.ordenCompra.findMany({
        where: { empresaId, proveedorId },
        include: {
          items: { include: { producto: { select: { sku: true, nombre: true, unidadMedida: true } } } },
        },
        orderBy: { fecha: 'desc' },
      }),
    );
  }

  /** Facturas ya enviadas por el proveedor autenticado. */
  misFacturas(empresaId: string, proveedorId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.facturaB2B.findMany({
        where: { empresaId, proveedorId },
        include: { ordenCompra: { select: { numero: true } } },
        orderBy: { fecha: 'desc' },
      }),
    );
  }

  /**
   * Crea una factura contra una OC — a diferencia de FacturasB2BService.create()
   * (llamado por un admin, que puede registrar en nombre de cualquier
   * proveedor), aquí SIEMPRE se verifica que la OC pertenezca al proveedor
   * autenticado en el token: sin esto, cualquier proveedor podría adivinar
   * un ordenCompraId ajeno y facturarlo.
   */
  async crearFactura(empresaId: string, proveedorId: string, dto: CreateFacturaB2BDto) {
    const orden = await this.prisma.withTenant(empresaId, (tx) =>
      tx.ordenCompra.findFirst({ where: { id: dto.ordenCompraId, empresaId } }),
    );
    if (!orden) throw new BadRequestException('La orden de compra indicada no existe o no pertenece a esta empresa');
    if (orden.proveedorId !== proveedorId) {
      throw new ForbiddenException('Esta orden de compra no pertenece a tu empresa proveedora');
    }
    if (orden.estado === 'CANCELADA') {
      throw new BadRequestException('No se puede registrar una factura contra una orden de compra cancelada');
    }

    try {
      return await this.prisma.withTenant(empresaId, (tx) =>
        tx.facturaB2B.create({
          data: {
            empresaId,
            ordenCompraId: dto.ordenCompraId,
            proveedorId,
            numero: dto.numero,
            fecha: dto.fecha ? new Date(dto.fecha) : undefined,
            monto: dto.monto,
            notas: dto.notas,
          },
        }),
      );
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new BadRequestException('Esta orden de compra ya tiene una factura registrada');
      }
      throw e;
    }
  }
}
