import { Injectable, NotFoundException } from '@nestjs/common';
import { EstadoRenovacion } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRenovacionDto } from './dto/create-renovacion.dto';
import { validarEnum } from '../../common/utils/validar-enum.util';
import { assertExists } from '../../common/utils/assert-exists.util';

@Injectable()
export class RenovacionesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filtros: { empresaId?: string; estado?: string } = {}) {
    return this.prisma.renovacionPlan.findMany({
      where: {
        ...(filtros.empresaId && { empresaId: filtros.empresaId }),
        ...(filtros.estado && { estado: validarEnum(filtros.estado, Object.values(EstadoRenovacion)) }),
      },
      include: { empresa: { select: { nombre: true, codigo: true } }, plan: { select: { nombre: true } } },
      orderBy: { fechaPago: 'desc' },
      // Tope de seguridad: el panel consume esto como array (Suscripciones,
      // Facturación, Dashboard). Sin paginación server-side todavía; las 500
      // más recientes cubren de sobra la vista. Filtrar por `empresaId` para
      // el histórico completo de un negocio.
      take: 500,
    });
  }

  async findOne(id: string) {
    const renovacion = await this.prisma.renovacionPlan.findUnique({
      where: { id },
      include: { empresa: { select: { nombre: true, codigo: true } }, plan: true },
    });
    if (!renovacion) throw new NotFoundException('Renovación no encontrada');
    return renovacion;
  }

  /**
   * Crea el registro de pago Y extiende la vigencia de la empresa en la misma
   * transacción — antes, registrar un pago no actualizaba Empresa.fechaVencimiento
   * ni Empresa.plan, dejando la extensión de vigencia como un paso manual aparte.
   *
   * También resetea `activo:true, estado:'activo'` (2026-09-04): si el cron de
   * vencimiento (NegociosService.actualizarEstadosVencimiento) ya había
   * marcado la empresa como 'vencido' con activo=false, sin esto el pago
   * quedaba registrado pero el negocio seguía bloqueado hasta que alguien lo
   * reactivara a mano por separado. No pisa 'cancelado'/'archivado' — esos
   * son decisiones explícitas del PlatformAdmin más allá de la simple
   * vigencia, así que si de verdad corresponde reactivar a un negocio
   * cancelado/archivado, que sea una acción aparte y consciente.
   */
  async create(dto: CreateRenovacionDto) {
    const empresa = await this.validarEmpresa(dto.empresaId);
    await this.validarPlan(dto.planId);

    const periodoFin = new Date(dto.periodoFin);
    const reactivar = !['cancelado', 'archivado'].includes(empresa.estado);

    const [renovacion] = await this.prisma.$transaction([
      this.prisma.renovacionPlan.create({
        data: {
          empresaId: dto.empresaId,
          planId: dto.planId,
          monto: dto.monto,
          moneda: dto.moneda,
          ciclo: dto.ciclo,
          fechaPago: dto.fechaPago ? new Date(dto.fechaPago) : undefined,
          metodoPago: dto.metodoPago,
          periodoInicio: new Date(dto.periodoInicio),
          periodoFin,
          comprobante: dto.comprobante,
        },
      }),
      this.prisma.empresa.update({
        where: { id: dto.empresaId },
        data: {
          plan: dto.planId,
          fechaVencimiento: periodoFin,
          ...(reactivar && { activo: true, estado: 'activo' }),
        },
      }),
    ]);

    return renovacion;
  }

  /** Soft "anular" en vez de DELETE físico — mismo principio que todo el backend. */
  async anular(id: string) {
    await this.findOne(id);
    return this.prisma.renovacionPlan.update({ where: { id }, data: { estado: 'ANULADO' } });
  }

  private validarEmpresa(empresaId: string) {
    return assertExists(
      () => this.prisma.empresa.findUnique({ where: { id: empresaId } }),
      'La empresa indicada no existe',
    );
  }

  private validarPlan(planId: string) {
    return assertExists(
      () => this.prisma.planSaaS.findUnique({ where: { id: planId } }),
      `El plan "${planId}" no existe`,
    );
  }
}
