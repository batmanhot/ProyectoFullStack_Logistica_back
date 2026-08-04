import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoDespacho, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertEmpaqueDto } from './dto/upsert-empaque.dto';
import { TIPOS_CAJA } from './tipos-caja.constant';
import { validarEnum } from '../common/utils/validar-enum.util';
import { assertExists } from '../common/utils/assert-exists.util';

// Mismos estados que ESTADOS_ACTIVOS en Empaque.jsx real.
const ESTADOS_ACTIVOS = ['PEDIDO', 'APROBADO', 'PICKING', 'LISTO', 'DESPACHADO'] as const;

@Injectable()
export class EmpaquesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Catálogo fijo — no es una tabla de BD. */
  tiposCaja() {
    return TIPOS_CAJA;
  }

  /**
   * Replica "despActivos" de Empaque.jsx — todos los despachos activos
   * (no ENTREGADO/CANCELADO) enriquecidos con su empaque y un badge
   * calculado (sin | pendiente | confirmado).
   */
  async findAll(
    empresaId: string,
    filtros: { estadoDespacho?: string; estadoEmpaque?: 'sin' | 'pendiente' | 'confirmado' } = {},
  ) {
    const despachos = await this.prisma.withTenant(empresaId, (tx) =>
      tx.despacho.findMany({
        where: {
          empresaId,
          estado: {
            in: filtros.estadoDespacho
              ? [validarEnum(filtros.estadoDespacho, Object.values(EstadoDespacho), 'estadoDespacho')!]
              : (ESTADOS_ACTIVOS as any),
          },
        },
        include: { empaque: true, cliente: { select: { razonSocial: true } } },
        orderBy: { fecha: 'desc' },
      }),
    );

    const enriquecidos = despachos.map((d) => ({
      ...d,
      empaqueEstado: !d.empaque ? 'sin' : d.empaque.estado === 'CONFIRMADO' ? 'confirmado' : ('pendiente' as const),
    }));

    if (!filtros.estadoEmpaque) return enriquecidos;
    return enriquecidos.filter((d) => d.empaqueEstado === filtros.estadoEmpaque);
  }

  async findOne(empresaId: string, despachoId: string) {
    const despacho = await this.validarDespacho(empresaId, despachoId);
    const empaque = await this.prisma.withTenant(empresaId, (tx) =>
      tx.empaque.findFirst({ where: { despachoId } }),
    );
    if (!empaque) throw new NotFoundException('Este despacho todavía no tiene empaque registrado');
    return { ...empaque, despacho };
  }

  /**
   * Crea o actualiza el empaque de un despacho (1:1). Solo se puede
   * registrar/editar mientras el despacho está activo (no ENTREGADO/CANCELADO),
   * igual que ESTADOS_ACTIVOS en el frontend real.
   */
  async upsert(empresaId: string, despachoId: string, dto: UpsertEmpaqueDto) {
    const despacho = await this.validarDespacho(empresaId, despachoId);
    if (!ESTADOS_ACTIVOS.includes(despacho.estado as any)) {
      throw new ForbiddenException(
        `No se puede registrar empaque para un despacho en estado ${despacho.estado}`,
      );
    }

    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.empaque.findFirst({ where: { despachoId } });
      const confirmado = dto.confirmar ?? false;
      const data = {
        tipoCajaId: dto.tipoCajaId,
        bultos: dto.bultos ?? 1,
        pesoTotal: dto.pesoTotal,
        instrucciones: dto.instrucciones,
        fragil: dto.fragil ?? false,
        estado: confirmado ? ('CONFIRMADO' as const) : ('PENDIENTE' as const),
      };

      const empaque = existente
        ? await tx.empaque.update({ where: { id: existente.id }, data })
        : await tx.empaque.create({ data: { despachoId, ...data } });

      // Simétrico a PickingService.confirmarLinea(): si al confirmar el
      // empaque el picking ya estaba 100% completo, avanza el despacho a
      // LISTO sin esperar el clic manual "Marcar Listo" — cualquiera de las
      // dos condiciones (empaque, picking) puede llegar primero.
      if (confirmado && despacho.estado === 'PICKING') {
        await this.avanzarSiPickingCompleto(tx, despachoId);
      }

      return empaque;
    });
  }

  private async avanzarSiPickingCompleto(tx: PrismaClient, despachoId: string) {
    const lista = await tx.listaPicking.findFirst({ where: { despachoId }, include: { lineas: true } });
    const completo = !!lista && lista.lineas.length > 0 && lista.lineas.every((l) => l.estado === 'COMPLETA');
    if (completo) {
      await tx.despacho.update({ where: { id: despachoId }, data: { estado: 'LISTO' } });
    }
  }

  private validarDespacho(empresaId: string, despachoId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.despacho.findFirst({ where: { id: despachoId, empresaId } })),
      'Despacho no encontrado',
      NotFoundException,
    );
  }
}
