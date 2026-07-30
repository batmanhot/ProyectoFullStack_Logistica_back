import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoFacturaB2B } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFacturaB2BDto } from './dto/create-factura-b2b.dto';
import { RechazarFacturaB2BDto } from './dto/rechazar-factura-b2b.dto';
import { validarEnum } from '../common/utils/validar-enum.util';

@Injectable()
export class FacturasB2BService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, filtros: { proveedorId?: string; estado?: string } = {}) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.facturaB2B.findMany({
        where: {
          empresaId,
          ...(filtros.proveedorId && { proveedorId: filtros.proveedorId }),
          ...(filtros.estado && { estado: validarEnum(filtros.estado, Object.values(EstadoFacturaB2B)) }),
        },
        include: {
          ordenCompra: { select: { numero: true, total: true } },
          proveedor: { select: { razonSocial: true } },
        },
        orderBy: { fecha: 'desc' },
        take: 500,
      }),
    );
  }

  async findOne(empresaId: string, id: string) {
    const factura = await this.prisma.withTenant(empresaId, (tx) =>
      tx.facturaB2B.findFirst({ where: { id, empresaId }, include: { ordenCompra: true } }),
    );
    if (!factura) throw new NotFoundException('Factura B2B no encontrada');
    return factura;
  }

  /** 1:1 con OrdenCompra — replica `tieneFactura = facturas.some(f=>f.ocId===oc.id)` del frontend real. */
  async create(empresaId: string, dto: CreateFacturaB2BDto) {
    const orden = await this.prisma.withTenant(empresaId, (tx) =>
      tx.ordenCompra.findFirst({ where: { id: dto.ordenCompraId, empresaId } }),
    );
    if (!orden) throw new BadRequestException('La orden de compra indicada no existe o no pertenece a esta empresa');
    if (orden.estado === 'CANCELADA') {
      throw new BadRequestException('No se puede registrar una factura contra una orden de compra cancelada');
    }

    try {
      return await this.prisma.withTenant(empresaId, (tx) =>
        tx.facturaB2B.create({
          data: {
            empresaId,
            ordenCompraId: dto.ordenCompraId,
            proveedorId: orden.proveedorId,
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

  async marcarRecibida(empresaId: string, id: string) {
    const factura = await this.findOne(empresaId, id);
    if (factura.estado !== 'ENVIADA') {
      throw new ForbiddenException(`Solo se puede marcar recibida una factura en estado ENVIADA (actual: ${factura.estado})`);
    }
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.facturaB2B.update({ where: { id }, data: { estado: 'RECIBIDA' } }),
    );
  }

  async rechazar(empresaId: string, id: string, dto: RechazarFacturaB2BDto) {
    const factura = await this.findOne(empresaId, id);
    if (factura.estado !== 'ENVIADA') {
      throw new ForbiddenException(`Solo se puede rechazar una factura en estado ENVIADA (actual: ${factura.estado})`);
    }
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.facturaB2B.update({
        where: { id },
        data: { estado: 'RECHAZADA', notas: dto.motivo ?? factura.notas },
      }),
    );
  }
}
