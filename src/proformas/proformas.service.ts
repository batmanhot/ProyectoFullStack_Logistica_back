import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoProforma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProformaDto } from './dto/create-proforma.dto';
import { UpdateProformaDto } from './dto/update-proforma.dto';
import { validarEnum } from '../common/utils/validar-enum.util';
import { assertExists } from '../common/utils/assert-exists.util';

const IGV_RATE = 0.18; // misma tasa usada en OrdenesCompraService

@Injectable()
export class ProformasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(empresaId: string, filtros: { clienteId?: string; estado?: string } = {}) {
    const proformas = await this.prisma.withTenant(empresaId, (tx) =>
      tx.proforma.findMany({
        where: {
          empresaId,
          ...(filtros.clienteId && { clienteId: filtros.clienteId }),
          ...(filtros.estado && { estado: validarEnum(filtros.estado, Object.values(EstadoProforma)) }),
        },
        include: { items: true, cliente: { select: { razonSocial: true } } },
        orderBy: { fecha: 'desc' },
        take: 500,
      }),
    );
    return Promise.all(proformas.map((p) => this.actualizarSiVencida(empresaId, p)));
  }

  async findOne(empresaId: string, id: string) {
    const proforma = await this.prisma.withTenant(empresaId, (tx) =>
      tx.proforma.findFirst({ where: { id, empresaId }, include: { items: true } }),
    );
    if (!proforma) throw new NotFoundException('Proforma no encontrada');
    return this.actualizarSiVencida(empresaId, proforma);
  }

  /**
   * Marca VENCIDA si sigue en BORRADOR/ENVIADA y ya pasó fechaVencimiento —
   * mismo patrón que CuentasPorCobrarService.actualizarSiVencida(). Antes,
   * Proforma tenía el estado VENCIDA en el enum pero ningún mecanismo que lo
   * asignara (asimetría con CxC, que sí lo hace).
   */
  private async actualizarSiVencida(empresaId: string, proforma: any) {
    const yaVencida = proforma.fechaVencimiento && proforma.fechaVencimiento < new Date();
    const pendiente = proforma.estado === 'BORRADOR' || proforma.estado === 'ENVIADA';
    if (yaVencida && pendiente) {
      return this.prisma.withTenant(empresaId, (tx) =>
        tx.proforma.update({
          where: { id: proforma.id },
          data: { estado: 'VENCIDA' },
          include: { items: true, cliente: { select: { razonSocial: true } } },
        }),
      );
    }
    return proforma;
  }

  async create(empresaId: string, dto: CreateProformaDto) {
    await this.validarCliente(empresaId, dto.clienteId);
    for (const item of dto.items) {
      await this.validarProducto(empresaId, item.productoId);
    }

    const subtotal = dto.items.reduce((acc, i) => acc + i.cantidad * i.precioUnitario, 0);
    const igv = Math.round(subtotal * IGV_RATE * 100) / 100;
    const total = subtotal + igv;

    return this.prisma.withTenant(empresaId, async (tx) => {
      const cantidadPrevia = await tx.proforma.count({ where: { empresaId } });
      const numero = `PRO-${String(cantidadPrevia + 1).padStart(5, '0')}`;

      try {
        return await tx.proforma.create({
          data: {
            empresaId,
            numero,
            clienteId: dto.clienteId,
            fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null,
            subtotal,
            igv,
            total,
            notas: dto.notas,
            items: {
              create: dto.items.map((i) => ({
                productoId: i.productoId,
                descripcion: i.descripcion,
                cantidad: i.cantidad,
                precioUnitario: i.precioUnitario,
                subtotal: i.cantidad * i.precioUnitario,
              })),
            },
          },
          include: { items: true },
        });
      } catch (e: any) {
        if (e.code === 'P2002') {
          throw new BadRequestException('Ya existe una proforma con ese número, intenta de nuevo');
        }
        throw e;
      }
    });
  }

  async update(empresaId: string, id: string, dto: UpdateProformaDto) {
    const proforma = await this.findOne(empresaId, id);
    if (proforma.estado === 'ACEPTADA' || proforma.estado === 'RECHAZADA') {
      throw new ForbiddenException(`No se puede modificar una proforma en estado ${proforma.estado}`);
    }

    return this.prisma.withTenant(empresaId, (tx) =>
      tx.proforma.update({
        where: { id },
        data: {
          ...(dto.fechaVencimiento !== undefined && { fechaVencimiento: new Date(dto.fechaVencimiento) }),
          ...(dto.notas !== undefined && { notas: dto.notas }),
          ...(dto.estado !== undefined && { estado: dto.estado }),
        },
        include: { items: true },
      }),
    );
  }

  /** "Eliminar" = RECHAZADA (no hay borrado físico — queda como histórico). */
  async remove(empresaId: string, id: string) {
    const proforma = await this.findOne(empresaId, id);
    if (proforma.estado === 'ACEPTADA' || proforma.estado === 'RECHAZADA') {
      throw new ForbiddenException(`No se puede eliminar una proforma en estado ${proforma.estado}`);
    }
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.proforma.update({ where: { id }, data: { estado: 'RECHAZADA' } }),
    );
  }

  private validarCliente(empresaId: string, clienteId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.cliente.findFirst({ where: { id: clienteId, empresaId } })),
      'El cliente indicado no existe o no pertenece a esta empresa',
    );
  }

  private validarProducto(empresaId: string, productoId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.producto.findFirst({ where: { id: productoId, empresaId } })),
      `El producto ${productoId} no existe o no pertenece a esta empresa`,
    );
  }
}
