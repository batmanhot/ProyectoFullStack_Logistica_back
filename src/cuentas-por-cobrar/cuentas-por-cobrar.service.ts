import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoCxC } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCuentaPorCobrarDto } from './dto/create-cuenta-por-cobrar.dto';
import { UpdateCuentaPorCobrarDto } from './dto/update-cuenta-por-cobrar.dto';
import { CreatePagoDto } from './dto/create-pago.dto';
import { validarEnum } from '../common/utils/validar-enum.util';
import { assertExists } from '../common/utils/assert-exists.util';

const DIAS_CREDITO_DEFAULT = 30;

@Injectable()
export class CuentasPorCobrarService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(empresaId: string, filtros: { clienteId?: string; estado?: string } = {}) {
    const cuentas = await this.prisma.withTenant(empresaId, (tx) =>
      tx.cuentaPorCobrar.findMany({
        where: {
          empresaId,
          ...(filtros.clienteId && { clienteId: filtros.clienteId }),
          ...(filtros.estado && { estado: validarEnum(filtros.estado, Object.values(EstadoCxC)) }),
        },
        include: { cliente: { select: { razonSocial: true } } },
        orderBy: { fechaVencimiento: 'asc' },
        take: 500,
      }),
    );
    return Promise.all(cuentas.map((c) => this.actualizarSiVencida(empresaId, c)));
  }

  async findOne(empresaId: string, id: string) {
    const cuenta = await this.prisma.withTenant(empresaId, (tx) =>
      tx.cuentaPorCobrar.findFirst({
        where: { id, empresaId },
        include: { pagos: { orderBy: { fecha: 'desc' } } },
      }),
    );
    if (!cuenta) throw new NotFoundException('Cuenta por cobrar no encontrada');
    return this.actualizarSiVencida(empresaId, cuenta);
  }

  async create(empresaId: string, dto: CreateCuentaPorCobrarDto) {
    await this.validarCliente(empresaId, dto.clienteId);
    if (dto.despachoId) {
      await this.validarDespacho(empresaId, dto.despachoId);
      await this.validarSinCxCPrevia(empresaId, dto.despachoId);
    }

    const diasCredito = dto.diasCredito ?? DIAS_CREDITO_DEFAULT;
    const fechaEmision = new Date();
    const fechaVencimiento = dto.fechaVencimiento
      ? new Date(dto.fechaVencimiento)
      : new Date(fechaEmision.getTime() + diasCredito * 24 * 60 * 60 * 1000);

    return this.prisma.withTenant(empresaId, async (tx) => {
      const cantidadPrevia = await tx.cuentaPorCobrar.count({ where: { empresaId } });
      const numero = `CXC-${String(cantidadPrevia + 1).padStart(5, '0')}`;

      try {
        return await tx.cuentaPorCobrar.create({
          data: {
            empresaId,
            numero,
            clienteId: dto.clienteId,
            despachoId: dto.despachoId,
            monto: dto.monto,
            saldo: dto.monto, // al crear, se debe el monto completo
            fechaEmision,
            fechaVencimiento,
            diasCredito,
            notas: dto.notas,
          },
        });
      } catch (e: any) {
        if (e.code === 'P2002') {
          throw new BadRequestException('Ya existe una cuenta por cobrar con ese número, intenta de nuevo');
        }
        throw e;
      }
    });
  }

  async update(empresaId: string, id: string, dto: UpdateCuentaPorCobrarDto) {
    const cuenta = await this.findOne(empresaId, id);
    if (cuenta.estado === 'COBRADA') {
      throw new BadRequestException('No se puede modificar una cuenta ya cobrada en su totalidad');
    }
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.cuentaPorCobrar.update({
        where: { id },
        data: {
          ...(dto.fechaVencimiento !== undefined && { fechaVencimiento: new Date(dto.fechaVencimiento) }),
          ...(dto.notas !== undefined && { notas: dto.notas }),
        },
      }),
    );
  }

  /**
   * Registra un abono — nunca se muta `saldo` directamente desde fuera;
   * todo pago queda como fila auditable en PagoCxC (mismo principio que
   * Movimiento en Fase 3: nunca mutar un agregado sin dejar rastro).
   */
  async registrarPago(empresaId: string, cuentaId: string, dto: CreatePagoDto) {
    const cuenta = await this.findOne(empresaId, cuentaId);
    if (cuenta.estado === 'COBRADA') {
      throw new BadRequestException('Esta cuenta ya está completamente cobrada');
    }
    const saldoActual = Number(cuenta.saldo);
    if (dto.monto > saldoActual) {
      throw new BadRequestException(
        `El monto del pago (${dto.monto}) no puede superar el saldo pendiente (${saldoActual})`,
      );
    }

    return this.prisma.withTenant(empresaId, async (tx) => {
      const pago = await tx.pagoCxC.create({
        data: {
          cuentaId,
          monto: dto.monto,
          metodo: dto.metodo,
          fecha: dto.fecha ? new Date(dto.fecha) : undefined,
          notas: dto.notas,
        },
      });

      const nuevoSaldo = saldoActual - dto.monto;
      const nuevoEstado = nuevoSaldo === 0 ? 'COBRADA' : 'PARCIAL';

      await tx.cuentaPorCobrar.update({
        where: { id: cuentaId },
        data: { saldo: nuevoSaldo, estado: nuevoEstado },
      });

      return pago;
    });
  }

  /**
   * Marca como VENCIDA si el saldo sigue pendiente y ya pasó la fecha —
   * actualización perezosa al leer, ya que no hay un job programado que
   * recorra la tabla periódicamente (fuera de alcance de esta fase).
   */
  private async actualizarSiVencida(empresaId: string, cuenta: any) {
    const yaVencida = cuenta.fechaVencimiento < new Date();
    const saldoPendiente = (cuenta.estado === 'PENDIENTE' || cuenta.estado === 'PARCIAL') && Number(cuenta.saldo) > 0;
    if (yaVencida && saldoPendiente && cuenta.estado !== 'VENCIDA') {
      return this.prisma.withTenant(empresaId, (tx) =>
        tx.cuentaPorCobrar.update({ where: { id: cuenta.id }, data: { estado: 'VENCIDA' } }),
      );
    }
    return cuenta;
  }

  private validarCliente(empresaId: string, clienteId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.cliente.findFirst({ where: { id: clienteId, empresaId } })),
      'El cliente indicado no existe o no pertenece a esta empresa',
    );
  }

  /** Despacho ahora tiene FK real (Fase 5). */
  private validarDespacho(empresaId: string, despachoId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.despacho.findFirst({ where: { id: despachoId, empresaId } })),
      'El despacho indicado no existe o no pertenece a esta empresa',
    );
  }

  /**
   * Antes, `despachoId` era solo un prefill de UI sin ninguna integridad de
   * negocio detrás — el mismo despacho podía terminar con varias CxC por
   * doble click o reintento. No hay estado "anulada" en EstadoCxC: cualquier
   * CxC existente para este despacho (sea cual sea su estado) ya cuenta como
   * la cuenta de esa venta.
   */
  private async validarSinCxCPrevia(empresaId: string, despachoId: string) {
    const existente = await this.prisma.withTenant(empresaId, (tx) =>
      tx.cuentaPorCobrar.findFirst({ where: { empresaId, despachoId }, select: { numero: true } }),
    );
    if (existente) {
      throw new BadRequestException(`Este despacho ya tiene una cuenta por cobrar asociada (${existente.numero})`);
    }
  }
}
