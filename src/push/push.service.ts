import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';

// Réplica en el backend de las condiciones "prioridad 1" de generarAlertas()
// (front/logistica/src/utils/alertas.js) — solo lo que vale la pena
// interrumpir a alguien con una notificación del sistema operativo.
const DIAS_ALERTA_VENCIMIENTO_URGENTE = 15;
const HORAS_ANTES_DE_REENVIAR = 24;

interface AlertaCritica {
  tipo: 'stock_agotado' | 'stock_critico' | 'vencimiento';
  clave: string; // productoId
  titulo: string;
  detalle: string;
  url: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger('PushService');

  constructor(private readonly prisma: PrismaService) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:soporte@stockpro.dev',
      process.env.VAPID_PUBLIC_KEY || '',
      process.env.VAPID_PRIVATE_KEY || '',
    );
  }

  subscribe(empresaId: string, usuarioId: string, dto: SubscribePushDto) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        empresaId,
        usuarioId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: dto.userAgent,
      },
      update: {
        empresaId,
        usuarioId,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: dto.userAgent,
      },
    });
  }

  unsubscribe(usuarioId: string, endpoint: string) {
    return this.prisma.pushSubscription.deleteMany({ where: { usuarioId, endpoint } });
  }

  /** Envía a una suscripción puntual; si está muerta (404/410), la borra. */
  private async enviarPush(sub: { id: string; endpoint: string; p256dh: string; auth: string }, payload: object) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      );
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        this.logger.log(`Suscripción vencida (${err.statusCode}), se borra: ${sub.endpoint}`);
        await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      } else {
        this.logger.error(`Falló el envío a ${sub.endpoint}`, err?.stack ?? String(err));
      }
    }
  }

  /** Alertas prioridad 1 de una empresa: stock agotado/crítico + vencimientos urgentes. */
  private async calcularAlertasCriticas(tx: PrismaClient, empresaId: string): Promise<AlertaCritica[]> {
    const alertas: AlertaCritica[] = [];

    const productos = await tx.producto.findMany({
      where: { empresaId, estado: 'Activo' },
      select: { id: true, nombre: true, unidadMedida: true, stockActual: true, stockMinimo: true },
    });

    for (const p of productos) {
      const stockActual = Number(p.stockActual) || 0;
      const stockMinimo = Number(p.stockMinimo) || 0;
      const unidad = p.unidadMedida || '';
      if (stockActual <= 0) {
        alertas.push({
          tipo: 'stock_agotado',
          clave: p.id,
          titulo: `${p.nombre} — Sin stock`,
          detalle: `El producto está agotado. Stock mínimo requerido: ${stockMinimo} ${unidad}.`,
          url: '/ordenes',
        });
      } else if (stockActual <= stockMinimo) {
        alertas.push({
          tipo: 'stock_critico',
          clave: p.id,
          titulo: `${p.nombre} — Stock crítico`,
          detalle: `Stock actual (${stockActual}) está por debajo del mínimo (${stockMinimo}) ${unidad}.`,
          url: '/reorden',
        });
      }
    }

    const lotes = await tx.loteProducto.findMany({
      where: { producto: { empresaId }, fechaVencimiento: { not: null } },
      select: { productoId: true, fechaVencimiento: true, producto: { select: { nombre: true } } },
    });
    const masUrgentePorProducto = new Map<string, { fecha: Date; nombre: string }>();
    for (const l of lotes) {
      if (!l.fechaVencimiento) continue; // ya filtrado por el where, TS no lo infiere
      const actual = masUrgentePorProducto.get(l.productoId);
      if (!actual || l.fechaVencimiento < actual.fecha) {
        masUrgentePorProducto.set(l.productoId, { fecha: l.fechaVencimiento, nombre: l.producto.nombre });
      }
    }
    const hoy = new Date();
    for (const [productoId, { fecha, nombre }] of masUrgentePorProducto) {
      const dias = Math.floor((fecha.getTime() - hoy.getTime()) / 86_400_000);
      const fechaTexto = fecha.toLocaleDateString('es-PE');
      if (dias < 0) {
        alertas.push({
          tipo: 'vencimiento',
          clave: productoId,
          titulo: `${nombre} — VENCIDO`,
          detalle: `Venció hace ${Math.abs(dias)} días. Fecha: ${fechaTexto}.`,
          url: '/vencimientos',
        });
      } else if (dias <= DIAS_ALERTA_VENCIMIENTO_URGENTE) {
        alertas.push({
          tipo: 'vencimiento',
          clave: productoId,
          titulo: `${nombre} — Próximo a vencer`,
          detalle: `Vence en ${dias} días (${fechaTexto}).`,
          url: '/vencimientos',
        });
      }
    }

    return alertas;
  }

  private async procesarEmpresa(empresaId: string) {
    // El envío real (enviarPush → red, potencialmente lento) NUNCA debe
    // pasar dentro de withTenant: es una transacción interactiva de Prisma
    // con timeout corto (5s por defecto) — hacer I/O de red ahí adentro la
    // hace expirar (bug real encontrado al probar esto en vivo). Todo el
    // trabajo de base de datos (calcular alertas + dedup) se resuelve acá
    // adentro; los envíos se disparan afuera, ya con la transacción cerrada.
    const porEnviar = await this.prisma.withTenant(empresaId, async (tx) => {
      const usuarios = await tx.usuario.findMany({
        where: { empresaId, activo: true, rol: { permisos: { some: { modulo: 'alertas' } } } },
        include: { pushSubscriptions: true },
      });
      const suscripciones = usuarios.flatMap((u) => u.pushSubscriptions);
      if (suscripciones.length === 0) return [];

      const alertas = await this.calcularAlertasCriticas(tx, empresaId);
      const clavesVigentes = new Set(alertas.map((a) => `${a.tipo}:${a.clave}`));

      // Alertas ya notificadas cuya condición dejó de cumplirse: se olvidan,
      // para que si reaparecen más adelante vuelvan a avisar.
      const notificadasPrevias = await tx.alertaNotificada.findMany({ where: { empresaId } });
      const resueltas = notificadasPrevias.filter((n) => !clavesVigentes.has(`${n.tipo}:${n.clave}`));
      if (resueltas.length > 0) {
        await tx.alertaNotificada.deleteMany({ where: { id: { in: resueltas.map((r) => r.id) } } });
      }

      const limite = new Date(Date.now() - HORAS_ANTES_DE_REENVIAR * 60 * 60 * 1000);
      const pendientes: AlertaCritica[] = [];
      for (const alerta of alertas) {
        const previa = notificadasPrevias.find((n) => n.tipo === alerta.tipo && n.clave === alerta.clave);
        if (previa && previa.fechaNotificada > limite) continue; // ya se avisó recientemente

        await tx.alertaNotificada.upsert({
          where: { empresaId_tipo_clave: { empresaId, tipo: alerta.tipo, clave: alerta.clave } },
          create: { empresaId, tipo: alerta.tipo, clave: alerta.clave },
          update: { fechaNotificada: new Date() },
        });
        pendientes.push(alerta);
      }
      return pendientes.map((alerta) => ({ alerta, suscripciones }));
    });

    let enviadas = 0;
    for (const { alerta, suscripciones } of porEnviar) {
      const payload = { title: alerta.titulo, body: alerta.detalle, url: alerta.url };
      await Promise.all(suscripciones.map((sub) => this.enviarPush(sub, payload)));
      enviadas++;
    }
    return enviadas;
  }

  async procesarTodasLasEmpresas() {
    const empresas = await this.prisma.empresa.findMany({ select: { id: true } });
    let total = 0;
    for (const { id: empresaId } of empresas) {
      // Chequeo barato antes de calcular alertas: si nadie de la empresa
      // está suscrito, no vale la pena ni entrar a withTenant. Filtra por el
      // empresaId denormalizado directo, NO vía la relación con Usuario —
      // esa tabla sí tiene RLS y fuera de withTenant esa unión da 0 filas
      // siempre con el rol restringido de la app (bug real encontrado en
      // esta misma sesión: dejaba el cron sin enviar nada, nunca).
      const hayInteresados = await this.prisma.pushSubscription.count({ where: { empresaId } });
      if (hayInteresados === 0) continue;
      total += await this.procesarEmpresa(empresaId);
    }
    if (total > 0) this.logger.log(`Enviadas ${total} notificaciones push de alertas críticas.`);
    return total;
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  revisarAlertasCriticas() {
    return this.procesarTodasLasEmpresas().catch((err) =>
      this.logger.error('Falló la revisión automática de alertas críticas', err?.stack ?? String(err)),
    );
  }
}
