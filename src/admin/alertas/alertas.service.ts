import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { CreateReglaAlertaDto } from './dto/create-regla-alerta.dto';
import { UpdateReglaAlertaDto } from './dto/update-regla-alerta.dto';
import { ResolverAlertaSaludDto } from './dto/resolver-alerta-salud.dto';
import { calcularEstadoEfectivo } from '../estado-negocio.util';

function diasHasta(fecha: Date | null): number | null {
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const objetivo = new Date(fecha);
  objetivo.setHours(0, 0, 0, 0);
  return Math.ceil((objetivo.getTime() - hoy.getTime()) / 86400000);
}

// ── Centro de Alertas: modelo de una alerta de salud del sistema ──────────
export type CategoriaAlerta =
  | 'vencimiento'
  | 'limite_excedido'
  | 'limite_al_borde'
  | 'entrega_fallando'
  | 'sin_email'
  | 'configuracion'
  | 'incidente'
  | 'backup';

export type SeveridadAlerta = 'critica' | 'alta' | 'media' | 'info';

export interface AlertaSalud {
  clave: string; // estable — identifica la alerta a través del tiempo para poder resolverla/silenciarla
  categoria: CategoriaAlerta;
  severidad: SeveridadAlerta;
  empresaId: string | null;
  empresaNombre: string | null;
  titulo: string;
  detalle: string;
  accionSugerida: string;
  desde: string; // ISO
  estado: 'nueva' | 'resuelta' | 'silenciada';
  nota: string | null;
}

const RANK_SEVERIDAD: Record<SeveridadAlerta, number> = { critica: 0, alta: 1, media: 2, info: 3 };

// Recursos con tope de plan que se vigilan por negocio. `activo` solo donde el
// modelo lo tiene — mismo criterio que hooks/usePlanLimits.js en el front.
const RECURSOS_LIMITE = [
  { recurso: 'usuarios', label: 'usuarios', planKey: 'maxUsuarios', modelo: 'usuario', filtroActivo: true },
  { recurso: 'almacenes', label: 'almacenes', planKey: 'maxAlmacenes', modelo: 'almacen', filtroActivo: true },
  { recurso: 'productos', label: 'productos', planKey: 'maxProductos', modelo: 'producto', filtroActivo: false },
  { recurso: 'proveedores', label: 'proveedores', planKey: 'maxProveedores', modelo: 'proveedor', filtroActivo: false },
  { recurso: 'clientes', label: 'clientes', planKey: 'maxClientes', modelo: 'cliente', filtroActivo: false },
] as const;

@Injectable()
export class AlertasService {
  private readonly logger = new Logger('AlertasService');

  // Cache de la bandeja de salud: el front la pollea cada 60s (Alertas +
  // Dashboard) y calcularla recorre todos los tenants con ~6 queries c/u.
  // TTL corto + invalidación al resolver/reabrir para que la UI no vea datos
  // viejos tras una acción.
  private static readonly SALUD_TTL_MS = 45_000;
  private saludCache: { at: number; data: AlertaSalud[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  // ── Reglas de alerta de vencimiento (CRUD) ─────────────────────────────
  findAll() {
    return this.prisma.reglaAlertaVencimiento.findMany({
      where: { eliminada: false },
      orderBy: { diasAntes: 'asc' },
    });
  }

  async findOne(id: string) {
    const regla = await this.prisma.reglaAlertaVencimiento.findUnique({ where: { id } });
    if (!regla || regla.eliminada) throw new NotFoundException('Regla de alerta no encontrada');
    return regla;
  }

  create(dto: CreateReglaAlertaDto) {
    return this.prisma.reglaAlertaVencimiento.create({ data: dto });
  }

  async update(id: string, dto: UpdateReglaAlertaDto) {
    await this.findOne(id);
    return this.prisma.reglaAlertaVencimiento.update({ where: { id }, data: dto });
  }

  /** Borrado real desde el panel: `eliminada:true` (no reaparece como "Inactiva"). */
  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.reglaAlertaVencimiento.update({
      where: { id },
      data: { eliminada: true, activa: false },
    });
  }

  /**
   * Delgado a propósito (sin email/plan): es lo que consume la tabla del
   * frontend. enviarAlertasPendientes() usa la variante completa
   * (calcularCoincidencias) para armar y mandar el correo real.
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
      where: { activa: true, eliminada: false },
      orderBy: { diasAntes: 'asc' },
    });
    if (reglas.length === 0) return [];

    const maxDias = Math.max(...reglas.map((r) => r.diasAntes));
    const empresas = await this.prisma.empresa.findMany({
      // Excluye estados fijados a mano (suspendido/cancelado/archivado): a esos
      // no se les manda "renueva tu plan". Los vencidos automáticos quedan
      // fuera por `activo:false` — ya no pueden entrar, no tiene sentido el correo.
      where: {
        activo: true,
        fechaVencimiento: { not: null },
        estado: { notIn: ['suspendido', 'cancelado', 'archivado'] },
      },
    });

    const planNombre = await this.mapaNombresPlan();

    const resultado: Array<{
      empresa: (typeof empresas)[number];
      dias: number;
      regla: (typeof reglas)[number] | null;
      planNombre: string;
    }> = [];

    for (const empresa of empresas) {
      const dias = diasHasta(empresa.fechaVencimiento);
      if (dias === null || dias > maxDias) continue;
      const regla = reglas.find((r) => dias <= r.diasAntes) ?? null;
      resultado.push({ empresa, dias, regla, planNombre: planNombre.get(empresa.plan) ?? empresa.plan });
    }

    return resultado.sort((a, b) => a.dias - b.dias);
  }

  private async mapaNombresPlan(): Promise<Map<string, string>> {
    const planes = await this.prisma.planSaaS.findMany({ select: { id: true, nombre: true } });
    return new Map(planes.map((p) => [p.id, p.nombre]));
  }

  /**
   * Envío REAL de las alertas de vencimiento por email. Corre cada mañana
   * (cron, hora de Lima) y también se dispara a demanda desde el panel.
   * Solo 'email' tiene envío real. Dedup por (empresa, regla, fechaVencimiento
   * vigente, canal).
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM, { timeZone: 'America/Lima' })
  async enviarAlertasPendientes() {
    const coincidencias = await this.calcularCoincidencias();
    let enviados = 0;
    let fallidos = 0;
    let omitidos = 0;

    for (const { empresa, dias, regla, planNombre } of coincidencias) {
      if (!regla || !regla.canales.includes('email') || !empresa.email) {
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

      // `{dias}` nunca negativo: un negocio ya vencido dentro del rango de una
      // regla mostraría "vence en -3 días".
      const diasTexto = dias <= 0 ? 'hoy' : String(dias);
      const reemplazar = (t: string) =>
        t
          .replace(/\{plan\}/g, planNombre)
          .replace(/\{dias\}/g, diasTexto)
          .replace(/\{empresa\}/g, empresa.nombre);

      try {
        await this.emailService.enviarCorreoSimple({
          destinatarioEmail: empresa.email,
          asunto: reemplazar(regla.asunto),
          mensaje: reemplazar(regla.mensaje),
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
      } catch (e) {
        await this.prisma.alertaEnvio.create({
          data: {
            empresaId: empresa.id,
            reglaId: regla.id,
            fechaVencimiento: empresa.fechaVencimiento!,
            canal: 'email',
            estado: 'fallido',
            error: (e instanceof Error ? e.message : String(e)).slice(0, 500),
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

  /** Historial de envíos reales — con filtros opcionales por empresa y estado. */
  historialEnvios(opts: { limite?: number; empresaId?: string; estado?: string } = {}) {
    return this.prisma.alertaEnvio.findMany({
      where: {
        ...(opts.empresaId && { empresaId: opts.empresaId }),
        ...(opts.estado && { estado: opts.estado }),
      },
      include: {
        empresa: { select: { nombre: true, codigo: true } },
        regla: { select: { asunto: true, diasAntes: true } },
      },
      orderBy: { enviadoAt: 'desc' },
      take: Math.min(opts.limite ?? 50, 200),
    });
  }

  // ── Centro de Alertas: salud del sistema (2026-09-08) ─────────────────
  /**
   * Bandeja unificada de alertas de salud de la plataforma: vencimientos,
   * topes de plan excedidos o al borde, correos rebotando, negocios sin email
   * de contacto y problemas de configuración. Se calcula en vivo; solo el
   * estado (resuelta/silenciada) se persiste en AlertaEstado por `clave`.
   * Cacheada {@link AlertasService.SALUD_TTL_MS}ms — ver `saludCache`.
   */
  async salud(): Promise<AlertaSalud[]> {
    if (this.saludCache && Date.now() - this.saludCache.at < AlertasService.SALUD_TTL_MS) {
      return this.saludCache.data;
    }
    const data = await this.calcularSalud();
    this.saludCache = { at: Date.now(), data };
    return data;
  }

  private async calcularSalud(): Promise<AlertaSalud[]> {
    const [empresas, reglasActivas, estados, incidentes, ultimoBackup, ultimaPrueba] = await Promise.all([
      this.prisma.empresa.findMany({
        where: { estado: { notIn: ['cancelado', 'archivado'] } },
        select: { id: true, nombre: true, estado: true, plan: true, email: true, fechaVencimiento: true, activo: true },
      }),
      this.prisma.reglaAlertaVencimiento.findMany({ where: { activa: true, eliminada: false } }),
      this.prisma.alertaEstado.findMany(),
      this.prisma.incidenteMonitor.findMany({ where: { resueltoAt: null }, orderBy: { inicioAt: 'desc' } }),
      this.prisma.respaldoNegocio.findFirst({ where: { estado: 'COMPLETADO' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      this.prisma.pruebaRestauracion.findFirst({ orderBy: { ejecutadaEn: 'desc' } }),
    ]);

    const planes = await this.prisma.planSaaS.findMany();
    const planPorId = new Map(planes.map((p) => [p.id, p]));
    const estadoPorClave = new Map(estados.map((e) => [e.clave, e]));
    const hayReglaEmailActiva = reglasActivas.some((r) => r.canales.includes('email'));

    const alertas: AlertaSalud[] = [];
    const push = (a: Omit<AlertaSalud, 'estado' | 'nota'>) => {
      const persistido = estadoPorClave.get(a.clave);
      let estado: AlertaSalud['estado'] = 'nueva';
      let nota: string | null = null;
      if (persistido) {
        const silencioVigente =
          persistido.estado === 'silenciada' &&
          (!persistido.silenciadaHasta || persistido.silenciadaHasta.getTime() > Date.now());
        if (persistido.estado === 'resuelta') { estado = 'resuelta'; nota = persistido.nota; }
        else if (silencioVigente) { estado = 'silenciada'; nota = persistido.nota; }
      }
      alertas.push({ ...a, estado, nota });
    };

    // 0) Incidentes abiertos del Monitor en Vivo (servicio degradado/caído).
    for (const inc of incidentes) {
      push({
        clave: `incidente:${inc.id}`,
        categoria: 'incidente',
        severidad: inc.severidad === 'caido' ? 'critica' : 'alta',
        empresaId: null,
        empresaNombre: null,
        titulo: `${inc.servicio}: ${inc.severidad === 'caido' ? 'caído' : 'degradado'}`,
        detalle: inc.detalle ?? `Detectado por el Monitor en Vivo el ${inc.inicioAt.toISOString()}.`,
        accionSugerida: 'Revisar el Monitor en Vivo y el estado de la infraestructura.',
        desde: inc.inicioAt.toISOString(),
      });
    }

    // 1) Vencimiento — mismo criterio que Negocios/Dashboard (calcularEstadoEfectivo).
    for (const e of empresas) {
      const ef = calcularEstadoEfectivo(e);
      if (!['por_vencer', 'gracia', 'vencido'].includes(ef)) continue;
      const dias = diasHasta(e.fechaVencimiento);
      const sev: SeveridadAlerta = ef === 'vencido' ? 'critica' : ef === 'gracia' ? 'alta' : 'media';
      const fechaIso = e.fechaVencimiento ? e.fechaVencimiento.toISOString().slice(0, 10) : 'sin-fecha';
      push({
        clave: `vencimiento:${e.id}:${fechaIso}`,
        categoria: 'vencimiento',
        severidad: sev,
        empresaId: e.id,
        empresaNombre: e.nombre,
        titulo:
          ef === 'vencido'
            ? 'Plan vencido — acceso bloqueado o por bloquearse'
            : ef === 'gracia'
              ? 'Plan vencido en período de gracia'
              : `Plan vence en ${dias} día(s)`,
        detalle: `Vencimiento: ${fechaIso}. Estado efectivo: ${ef}.`,
        accionSugerida:
          ef === 'vencido'
            ? 'Registrar la renovación o suspender formalmente el negocio.'
            : 'Confirmar el pago y registrar la renovación antes de que se corte el acceso.',
        desde: (e.fechaVencimiento ?? new Date()).toISOString(),
      });
    }

    // 2) Topes de plan — excedidos o al borde (≥90%). Requiere contar dentro
    //    del contexto de tenant: usuarios/almacenes/productos/... tienen RLS.
    const activasConPlan = empresas.filter((e) => e.activo && planPorId.has(e.plan));
    const conteos = await Promise.all(
      activasConPlan.map((e) =>
        this.prisma
          .withTenant(e.id, async (tx) => {
            const client = tx as unknown as Record<string, { count: (a: unknown) => Promise<number> }>;
            const out: Record<string, number> = {};
            for (const r of RECURSOS_LIMITE) {
              out[r.recurso] = await client[r.modelo].count({
                where: { empresaId: e.id, ...(r.filtroActivo ? { activo: true } : {}) },
              });
            }
            return { empresaId: e.id, out };
          })
          .catch(() => ({ empresaId: e.id, out: {} as Record<string, number> })),
      ),
    );
    const conteoPorEmpresa = new Map(conteos.map((c) => [c.empresaId, c.out]));

    for (const e of activasConPlan) {
      const plan = planPorId.get(e.plan)!;
      const conteo = conteoPorEmpresa.get(e.id) ?? {};
      for (const r of RECURSOS_LIMITE) {
        const max = (plan as unknown as Record<string, number>)[r.planKey];
        if (max == null || max < 0) continue; // -1 = ilimitado
        const usado = conteo[r.recurso] ?? 0;
        if (usado > max) {
          // Solo pasa con datos heredados o tras una bajada de plan — el
          // enforcement (plan-limits.util.ts) impide superarlo en caliente.
          push({
            clave: `limite_excedido:${e.id}:${r.recurso}`,
            categoria: 'limite_excedido',
            severidad: 'alta',
            empresaId: e.id,
            empresaNombre: e.nombre,
            titulo: `Tope de ${r.label} superado (${usado}/${max})`,
            detalle: `Plan "${plan.nombre}": ${usado} ${r.label} sobre un máximo de ${max}.`,
            accionSugerida: 'Subir de plan al negocio, ampliar el tope del plan o desactivar registros.',
            desde: new Date().toISOString(),
          });
        } else if (max > 0 && usado / max >= 0.9) {
          const sinMargen = usado === max;
          push({
            clave: `limite_al_borde:${e.id}:${r.recurso}`,
            categoria: 'limite_al_borde',
            severidad: 'media',
            empresaId: e.id,
            empresaNombre: e.nombre,
            titulo: sinMargen
              ? `Tope de ${r.label} sin margen (${usado}/${max})`
              : `${r.label} al ${Math.round((usado / max) * 100)}% del tope (${usado}/${max})`,
            detalle: `Plan "${plan.nombre}": ${sinMargen ? 'no puede dar de alta más' : 'queda poco margen antes de bloquear nuevas altas de'} ${r.label}.`,
            accionSugerida: 'Avisar al negocio o anticipar el cambio de plan.',
            desde: new Date().toISOString(),
          });
        }
      }
    }

    // 3) Entregas de correo fallando (últimos 7 días), agrupadas por empresa.
    const hace7d = new Date(Date.now() - 7 * 86_400_000);
    const fallidos = await this.prisma.alertaEnvio.groupBy({
      by: ['empresaId'],
      where: { estado: 'fallido', enviadoAt: { gte: hace7d } },
      _count: { _all: true },
      _max: { enviadoAt: true },
    });
    for (const g of fallidos) {
      const emp = empresas.find((e) => e.id === g.empresaId);
      push({
        clave: `entrega_fallando:${g.empresaId}`,
        categoria: 'entrega_fallando',
        severidad: 'alta',
        empresaId: g.empresaId,
        empresaNombre: emp?.nombre ?? null,
        titulo: `${g._count._all} envío(s) de alerta fallaron (7 días)`,
        detalle: 'El correo de aviso de vencimiento rebotó o el SMTP lo rechazó.',
        accionSugerida: 'Revisar el email de contacto del negocio y la configuración SMTP.',
        desde: (g._max.enviadoAt ?? new Date()).toISOString(),
      });
    }

    // 4) Negocio activo sin email de contacto pero con reglas de email activas.
    if (hayReglaEmailActiva) {
      for (const e of empresas) {
        if (!e.activo || (e.email && e.email.trim())) continue;
        push({
          clave: `sin_email:${e.id}`,
          categoria: 'sin_email',
          severidad: 'media',
          empresaId: e.id,
          empresaNombre: e.nombre,
          titulo: 'Negocio sin email de contacto',
          detalle: 'Hay reglas de alerta por email activas, pero este negocio nunca recibirá un aviso.',
          accionSugerida: 'Cargar el email de contacto en la ficha del negocio.',
          desde: new Date().toISOString(),
        });
      }
    }

    // 5) Configuración de las reglas.
    if (reglasActivas.length === 0) {
      push({
        clave: 'configuracion:sin_reglas',
        categoria: 'configuracion',
        severidad: 'media',
        empresaId: null,
        empresaNombre: null,
        titulo: 'No hay reglas de alerta activas',
        detalle: 'El envío automático de avisos de vencimiento no está haciendo nada.',
        accionSugerida: 'Crear al menos una regla en la pestaña "Reglas".',
        desde: new Date().toISOString(),
      });
    }
    for (const r of reglasActivas) {
      if (r.canales.includes('email')) continue;
      push({
        clave: `configuracion:regla_sin_email:${r.id}`,
        categoria: 'configuracion',
        severidad: 'media',
        empresaId: null,
        empresaNombre: null,
        titulo: `Regla "${r.asunto}" activa pero sin canal email`,
        detalle: 'Solo el canal email envía de verdad. Esta regla figura activa pero no manda nada.',
        accionSugerida: 'Agregar el canal "email" a la regla o desactivarla.',
        desde: new Date().toISOString(),
      });
    }

    // 6) Salud de los backups (job externo — ver docs/BACKUP-RESTORE.md).
    const edadBackupH = ultimoBackup ? (Date.now() - ultimoBackup.createdAt.getTime()) / 3_600_000 : Infinity;
    if (edadBackupH > 26) {
      push({
        clave: 'backup_atrasado:global',
        categoria: 'backup',
        severidad: 'critica',
        empresaId: null,
        empresaNombre: null,
        titulo: ultimoBackup ? `Sin backups nuevos hace ${Math.round(edadBackupH)} h` : 'Nunca se registró un backup',
        detalle: 'El job de respaldo nocturno no reportó un backup COMPLETADO dentro de las últimas 26 h.',
        accionSugerida: 'Revisar el workflow de backup (GitHub Actions / cron) y las credenciales del object storage.',
        desde: (ultimoBackup?.createdAt ?? new Date(0)).toISOString(),
      });
    }
    if (ultimaPrueba?.resultado === 'fallo') {
      push({
        clave: `restore_test_fallido:${ultimaPrueba.id}`,
        categoria: 'backup',
        severidad: 'alta',
        empresaId: null,
        empresaNombre: null,
        titulo: 'El último test de restauración falló',
        detalle: ultimaPrueba.detalle ?? 'La prueba periódica de restauración a un Postgres efímero no pasó.',
        accionSugerida: 'Revisar el log del job de test de restore; los backups pueden no ser restaurables.',
        desde: ultimaPrueba.ejecutadaEn.toISOString(),
      });
    }

    return alertas.sort((a, b) => {
      const s = RANK_SEVERIDAD[a.severidad] - RANK_SEVERIDAD[b.severidad];
      return s !== 0 ? s : b.desde.localeCompare(a.desde);
    });
  }

  /** Marca una alerta derivada como resuelta o silenciada (Centro de Alertas). */
  async resolverAlertaSalud(clave: string, dto: ResolverAlertaSaludDto, adminEmail?: string) {
    const silenciadaHasta =
      dto.estado === 'silenciada' && dto.silenciarDias
        ? new Date(Date.now() + dto.silenciarDias * 86_400_000)
        : null;

    const data = {
      estado: dto.estado,
      nota: dto.nota ?? null,
      silenciadaHasta,
      actualizadoPor: adminEmail ?? null,
    };

    const res = await this.prisma.alertaEstado.upsert({
      where: { clave },
      create: { clave, ...data },
      update: data,
    });
    this.saludCache = null; // la bandeja cambió — que el próximo GET recalcule
    return res;
  }

  /** Reabre una alerta silenciada/resuelta (borra su estado persistido). */
  async reabrirAlertaSalud(clave: string) {
    await this.prisma.alertaEstado.deleteMany({ where: { clave } });
    this.saludCache = null;
    return { clave, estado: 'nueva' as const };
  }
}
