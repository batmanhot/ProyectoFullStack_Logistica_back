import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { esErrorUnicidad } from '../../common/utils/prisma-error.util';
import { EmitirFacturaDto } from './dto/emitir-factura.dto';
import { RegistrarCobroDto } from './dto/registrar-cobro.dto';

/** IGV Perú — el importe base de la factura viaja SIN impuesto; el total se calcula acá. */
const IGV = 0.18;
const money = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

type FacturaConRelaciones = Prisma.FacturaSaaSGetPayload<{
  include: { empresa: { select: { nombre: true; codigo: true; ruc: true } }; plan: { select: { nombre: true } } };
}>;

const INCLUDE = {
  empresa: { select: { nombre: true, codigo: true, ruc: true } },
  plan: { select: { nombre: true } },
} as const;

/**
 * Estado "efectivo" de la factura. `vencida` NUNCA se persiste: una factura
 * EMITIDA cuya fecha de vencimiento ya pasó se muestra como vencida sin tocar
 * la fila — mismo criterio que `estadoEfectivo` de Negocios.
 */
export function estadoEfectivoFactura(f: { estado: string; venceEn: Date | string }): string {
  if (f.estado === 'EMITIDA' && new Date(f.venceEn) < new Date()) return 'vencida';
  return f.estado.toLowerCase();
}

/** `where` de Prisma para filtrar por un estado que puede ser derivado (`vencida`). */
function whereEstado(estado?: string): Prisma.FacturaSaaSWhereInput {
  switch ((estado || '').toLowerCase()) {
    case 'emitida':
      return { estado: 'EMITIDA', venceEn: { gte: new Date() } };
    case 'vencida':
      return { estado: 'EMITIDA', venceEn: { lt: new Date() } };
    case 'pagada':
      return { estado: 'PAGADA' };
    case 'anulada':
      return { estado: 'ANULADA' };
    default:
      return {};
  }
}

@Injectable()
export class FacturacionService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Lectura ────────────────────────────────────────────────────────────

  async findAll(filtros: { estado?: string; busqueda?: string; page?: number; pageSize?: number } = {}) {
    const page = Math.max(1, filtros.page ?? 1);
    const pageSize = Math.min(Math.max(1, filtros.pageSize ?? 25), 100);

    const and: Prisma.FacturaSaaSWhereInput[] = [];
    const wEstado = whereEstado(filtros.estado);
    if (Object.keys(wEstado).length) and.push(wEstado);
    if (filtros.busqueda?.trim()) {
      const q = filtros.busqueda.trim();
      and.push({
        OR: [
          { numero: { contains: q, mode: 'insensitive' } },
          { planNombre: { contains: q, mode: 'insensitive' } },
          { referenciaPago: { contains: q, mode: 'insensitive' } },
          { empresa: { is: { nombre: { contains: q, mode: 'insensitive' } } } },
        ],
      });
    }
    const where: Prisma.FacturaSaaSWhereInput = and.length ? { AND: and } : {};

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.facturaSaaS.findMany({ where, include: INCLUDE, orderBy: { emitidaEn: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.facturaSaaS.count({ where }),
    ]);

    return { items: rows.map((r) => this.mapFactura(r)), total, page, pageSize };
  }

  async resumen() {
    // Agregación en BD en vez de traer todas las filas y sumar en Node.
    const [porEstado, vencidasAgg] = await Promise.all([
      this.prisma.facturaSaaS.groupBy({
        by: ['estado'],
        _sum: { total: true },
        _count: true,
        orderBy: { estado: 'asc' },
      }),
      this.prisma.facturaSaaS.aggregate({
        where: { estado: 'EMITIDA', venceEn: { lt: new Date() } },
        _sum: { total: true },
        _count: true,
      }),
    ]);

    const bucket = (estado: 'EMITIDA' | 'PAGADA' | 'ANULADA') => {
      const row = porEstado.find((r) => r.estado === estado);
      return { total: Number(row?._sum?.total ?? 0), count: row?._count ?? 0 };
    };
    const emitida = bucket('EMITIDA');
    const pagada = bucket('PAGADA');

    return {
      facturado: money(emitida.total + pagada.total), // no anuladas
      cobrado: money(pagada.total),
      porCobrar: money(emitida.total),
      vencido: money(Number(vencidasAgg._sum.total ?? 0)),
      pendientes: emitida.count,
      emitidas: emitida.count,
      vencidas: vencidasAgg._count,
    };
  }

  async historial(filtros: { limite?: number } = {}) {
    const take = Math.min(Math.max(1, filtros.limite ?? 100), 300);
    const eventos = await this.prisma.eventoFacturaSaaS.findMany({
      orderBy: { fecha: 'desc' },
      take,
      include: { factura: { select: { numero: true, empresa: { select: { nombre: true } } } } },
    });
    return eventos.map((e) => ({
      id: e.id,
      facturaId: e.facturaId,
      numero: e.factura?.numero ?? '—',
      empresaNombre: e.factura?.empresa?.nombre ?? '',
      tipo: e.tipo,
      detalle: e.detalle,
      monto: money(Number(e.monto)),
      fecha: e.fecha,
    }));
  }

  async findOne(id: string) {
    const f = await this.prisma.facturaSaaS.findUnique({
      where: { id },
      include: { ...INCLUDE, eventos: { orderBy: { fecha: 'desc' } } },
    });
    if (!f) throw new NotFoundException('Factura no encontrada');
    return {
      ...this.mapFactura(f),
      eventos: f.eventos.map((e) => ({ id: e.id, tipo: e.tipo, detalle: e.detalle, monto: money(Number(e.monto)), fecha: e.fecha })),
    };
  }

  // ── Mutaciones ─────────────────────────────────────────────────────────

  async emitir(dto: EmitirFacturaDto) {
    const [empresa, plan] = await Promise.all([
      this.prisma.empresa.findUnique({ where: { id: dto.empresaId }, select: { id: true, nombre: true } }),
      this.prisma.planSaaS.findUnique({ where: { id: dto.planId }, select: { id: true, nombre: true } }),
    ]);
    if (!empresa) throw new BadRequestException('La empresa indicada no existe');
    if (!plan) throw new BadRequestException(`El plan "${dto.planId}" no existe`);

    if (dto.renovacionId) {
      const ren = await this.prisma.renovacionPlan.findUnique({ where: { id: dto.renovacionId }, select: { empresaId: true } });
      if (!ren) throw new BadRequestException('La renovación indicada no existe');
      if (ren.empresaId !== dto.empresaId) throw new BadRequestException('La renovación pertenece a otro negocio');
    }

    const emitidaEn = dto.emitidaEn ? new Date(dto.emitidaEn) : new Date();
    const venceEn = new Date(dto.venceEn);
    if (venceEn < emitidaEn) throw new BadRequestException('La fecha de vencimiento no puede ser anterior a la de emisión');

    const subtotal = money(dto.subtotal);
    const igv = money(subtotal * IGV);
    const total = money(subtotal + igv);

    const datosBase = {
      empresaId: dto.empresaId,
      renovacionId: dto.renovacionId ?? null,
      planId: dto.planId,
      planNombre: plan.nombre,
      ciclo: dto.ciclo ?? 'mensual',
      moneda: dto.moneda ?? 'PEN',
      subtotal,
      igv,
      total,
      emitidaEn,
      venceEn,
      nota: dto.nota?.trim() || null,
      eventos: { create: { tipo: 'emitida', detalle: 'Documento generado desde la suscripción', monto: total } },
    };

    // `numero` es correlativo por count() — si dos emisiones concurrentes
    // calculan el mismo, la 2ª choca con el índice único: se reintenta con el
    // siguiente en vez de devolver un 500.
    for (let intento = 0; ; intento++) {
      try {
        const factura = await this.prisma.facturaSaaS.create({
          data: { ...datosBase, numero: await this.siguienteNumero() },
          include: INCLUDE,
        });
        return this.mapFactura(factura);
      } catch (e) {
        if (esErrorUnicidad(e) && intento < 4) continue;
        throw e;
      }
    }
  }

  async marcarEnviada(id: string) {
    const f = await this.getFactura(id);
    if (f.estado === 'ANULADA') throw new BadRequestException('No se puede enviar un documento anulado');
    if (f.enviadaEn) return this.mapFactura(f);

    const actualizada = await this.prisma.facturaSaaS.update({
      where: { id },
      data: {
        enviadaEn: new Date(),
        eventos: { create: { tipo: 'enviada', detalle: 'Documento marcado como enviado al cliente', monto: f.total } },
      },
      include: INCLUDE,
    });
    return this.mapFactura(actualizada);
  }

  async registrarCobro(id: string, dto: RegistrarCobroDto) {
    const f = await this.getFactura(id);
    if (f.estado === 'PAGADA') throw new BadRequestException('La factura ya está cobrada');
    if (f.estado === 'ANULADA') throw new BadRequestException('No se puede cobrar un documento anulado');

    const pagadaEn = dto.pagadaEn ? new Date(dto.pagadaEn) : new Date();

    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.facturaSaaS.update({
        where: { id },
        data: {
          estado: 'PAGADA',
          metodoPago: dto.metodoPago,
          referenciaPago: dto.referenciaPago.trim(),
          pagadaEn,
          eventos: {
            create: { tipo: 'cobro_registrado', detalle: `Cobro confirmado · ${dto.referenciaPago.trim()}`, monto: f.total },
          },
        },
      }),
    ];

    // Vincular sin duplicar: si la factura nació de una renovación que quedó
    // pendiente/fallida, este cobro la concilia. No crea un pago nuevo ni
    // vuelve a extender la vigencia (eso ya lo hizo `RenovacionesService.create`).
    if (f.renovacionId && (f.renovacion?.estado === 'PENDIENTE' || f.renovacion?.estado === 'FALLIDO')) {
      ops.push(this.prisma.renovacionPlan.update({ where: { id: f.renovacionId }, data: { estado: 'PAGADO' } }));
    }

    await this.prisma.$transaction(ops);
    return this.findOne(id);
  }

  async anular(id: string) {
    const f = await this.getFactura(id);
    if (f.estado === 'PAGADA') throw new BadRequestException('No se puede anular una factura ya cobrada');
    if (f.estado === 'ANULADA') return this.mapFactura(f);

    const actualizada = await this.prisma.facturaSaaS.update({
      where: { id },
      data: {
        estado: 'ANULADA',
        eventos: { create: { tipo: 'anulada', detalle: 'Documento anulado por el SuperAdmin', monto: f.total } },
      },
      include: INCLUDE,
    });
    return this.mapFactura(actualizada);
  }

  // ── Internos ───────────────────────────────────────────────────────────

  private async getFactura(id: string) {
    const f = await this.prisma.facturaSaaS.findUnique({
      where: { id },
      include: { ...INCLUDE, renovacion: { select: { estado: true } } },
    });
    if (!f) throw new NotFoundException('Factura no encontrada');
    return f;
  }

  /** Correlativo legible. `numero` es @unique — si dos emisiones cruzan, la 2ª reintenta. */
  private async siguienteNumero(): Promise<string> {
    const n = await this.prisma.facturaSaaS.count();
    return `FAC-${String(n + 1001).padStart(6, '0')}`;
  }

  private mapFactura(f: FacturaConRelaciones) {
    return {
      id: f.id,
      numero: f.numero,
      empresaId: f.empresaId,
      empresaNombre: f.empresa?.nombre ?? 'Negocio eliminado',
      empresaCodigo: f.empresa?.codigo ?? null,
      empresaRuc: f.empresa?.ruc ?? null,
      renovacionId: f.renovacionId,
      planId: f.planId,
      planNombre: f.planNombre || f.plan?.nombre || f.planId,
      ciclo: f.ciclo,
      moneda: f.moneda,
      subtotal: money(Number(f.subtotal)),
      igv: money(Number(f.igv)),
      total: money(Number(f.total)),
      emitidaEn: f.emitidaEn,
      venceEn: f.venceEn,
      enviadaEn: f.enviadaEn,
      enviada: !!f.enviadaEn,
      estado: estadoEfectivoFactura(f),
      estadoReal: f.estado,
      metodoPago: f.metodoPago,
      referenciaPago: f.referenciaPago,
      pagadaEn: f.pagadaEn,
      nota: f.nota,
    };
  }
}
