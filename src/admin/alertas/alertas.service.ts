import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { CreateReglaAlertaDto } from './dto/create-regla-alerta.dto';
import { UpdateReglaAlertaDto } from './dto/update-regla-alerta.dto';

function diasHasta(fecha: Date | null): number | null {
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const objetivo = new Date(fecha);
  objetivo.setHours(0, 0, 0, 0);
  return Math.ceil((objetivo.getTime() - hoy.getTime()) / 86400000);
}

@Injectable()
export class AlertasService {
  private readonly logger = new Logger('AlertasService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  findAll() {
    return this.prisma.reglaAlertaVencimiento.findMany({ orderBy: { diasAntes: 'asc' } });
  }

  async findOne(id: string) {
    const regla = await this.prisma.reglaAlertaVencimiento.findUnique({ where: { id } });
    if (!regla) throw new NotFoundException('Regla de alerta no encontrada');
    return regla;
  }

  create(dto: CreateReglaAlertaDto) {
    return this.prisma.reglaAlertaVencimiento.create({ data: dto });
  }

  async update(id: string, dto: UpdateReglaAlertaDto) {
    await this.findOne(id);
    return this.prisma.reglaAlertaVencimiento.update({ where: { id }, data: dto });
  }

  /** Soft-delete reutilizando el flag "activa" que ya existe en el modelo. */
  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.reglaAlertaVencimiento.update({ where: { id }, data: { activa: false } });
  }

  /**
   * Replica "proximosVencimientos" de AdminSaaS.jsx — cruza
   * Empresa.fechaVencimiento contra las reglas activas (mismo patrón que
   * FlotaService.alertas() en Fase 7a). Delgado a propósito (sin email/plan):
   * es lo que consume la tabla del frontend. enviarAlertasPendientes() usa
   * la variante completa (calcularCoincidencias) para tener con qué armar
   * y mandar el correo real.
   */
  async vencimientosProximos() {
    const coincidencias = await this.calcularCoincidencias();
    return coincidencias.map((c) => ({
      empresaId: c.empresa.id,
      nombre: c.empresa.nombre,
      codigo: c.empresa.codigo,
      fechaVencimiento: c.empresa.fechaVencimiento!,
      dias: c.dias,
      reglaAplicable: c.regla ? { id: c.regla.id, asunto: c.regla.asunto, canales: c.regla.canales } : null,
    }));
  }

  /** Base compartida entre vencimientosProximos() (vista) y enviarAlertasPendientes() (envío real). */
  private async calcularCoincidencias() {
    const reglas = await this.prisma.reglaAlertaVencimiento.findMany({
      where: { activa: true },
      orderBy: { diasAntes: 'asc' },
    });
    if (reglas.length === 0) return [];

    const maxDias = Math.max(...reglas.map((r) => r.diasAntes));
    const empresas = await this.prisma.empresa.findMany({
      where: { activo: true, fechaVencimiento: { not: null } },
    });

    const resultado: Array<{
      empresa: (typeof empresas)[number];
      dias: number;
      regla: (typeof reglas)[number] | null;
    }> = [];

    for (const empresa of empresas) {
      const dias = diasHasta(empresa.fechaVencimiento);
      if (dias === null || dias > maxDias) continue;

      const regla = reglas.find((r) => dias <= r.diasAntes) ?? null;
      resultado.push({ empresa, dias, regla });
    }

    return resultado.sort((a, b) => a.dias - b.dias);
  }

  /**
   * Envío REAL de las alertas de vencimiento (2026-09-04) — antes esto no
   * existía: "Alertas de Vencimiento" tenía plantillas, canales y un toggle
   * "activa" que no disparaban nada, solo alimentaban la tabla que el
   * PlatformAdmin tenía que mirar a mano. Corre cada mañana (cron) y también
   * se puede disparar a demanda desde el panel.
   *
   * Solo 'email' tiene envío real hoy — 'sistema' ya se cumple con la propia
   * tabla de vencimientos próximos del panel; 'whatsapp'/'sms' no tienen
   * integración real todavía, así que NO se simulan (ver criterio del
   * blueprint de gobierno: nunca aparentar una integración que no existe).
   *
   * Dedup por (empresa, regla, fechaVencimiento vigente): si el negocio
   * renueva, fechaVencimiento cambia y la misma regla puede volver a
   * dispararse para el nuevo ciclo — pero dentro del mismo ciclo, cada regla
   * se envía UNA sola vez, no todos los días mientras siga dentro de su
   * rango de días.
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async enviarAlertasPendientes() {
    const coincidencias = await this.calcularCoincidencias();
    let enviados = 0;
    let fallidos = 0;
    let omitidos = 0;

    for (const { empresa, dias, regla } of coincidencias) {
      if (!regla || !regla.canales.includes('email')) {
        omitidos++;
        continue;
      }
      if (!empresa.email) {
        omitidos++;
        continue;
      }

      const yaEnviado = await this.prisma.alertaEnvio.findUnique({
        where: {
          empresaId_reglaId_fechaVencimiento_canal: {
            empresaId: empresa.id,
            reglaId: regla.id,
            fechaVencimiento: empresa.fechaVencimiento!,
            canal: 'email',
          },
        },
      });
      if (yaEnviado) {
        omitidos++;
        continue;
      }

      const mensaje = regla.mensaje
        .replace(/\{plan\}/g, empresa.plan)
        .replace(/\{dias\}/g, String(dias))
        .replace(/\{empresa\}/g, empresa.nombre);

      try {
        await this.emailService.enviarCorreoSimple({
          destinatarioEmail: empresa.email,
          asunto: regla.asunto,
          mensaje,
        });
        await this.prisma.alertaEnvio.create({
          data: {
            empresaId: empresa.id,
            reglaId: regla.id,
            fechaVencimiento: empresa.fechaVencimiento!,
            canal: 'email',
            estado: 'enviado',
          },
        });
        enviados++;
      } catch (e: any) {
        await this.prisma.alertaEnvio.create({
          data: {
            empresaId: empresa.id,
            reglaId: regla.id,
            fechaVencimiento: empresa.fechaVencimiento!,
            canal: 'email',
            estado: 'fallido',
            error: String(e?.message ?? e).slice(0, 500),
          },
        });
        fallidos++;
      }
    }

    if (enviados || fallidos) {
      this.logger.log(`Alertas de vencimiento: ${enviados} enviada(s), ${fallidos} fallida(s), ${omitidos} omitida(s).`);
    }
    return { enviados, fallidos, omitidos };
  }

  /** Historial de envíos — para que el panel muestre que de verdad se mandó algo, no solo que "debería". */
  historialEnvios(limite = 50) {
    return this.prisma.alertaEnvio.findMany({
      include: {
        empresa: { select: { nombre: true, codigo: true } },
        regla: { select: { asunto: true, diasAntes: true } },
      },
      orderBy: { enviadoAt: 'desc' },
      take: Math.min(limite, 200),
    });
  }
}
