import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { performance } from 'node:perf_hooks';
import { PrismaService } from '../../prisma/prisma.service';

// ── Telemetría de peticiones en memoria ─────────────────────────────────
// Un ring buffer de las últimas ~10 min de requests. NO se persiste: es un
// monitor "en vivo" de la instancia que está sirviendo tráfico. En Render free
// (1 instancia) refleja toda la plataforma; con varias instancias, solo la
// propia. Se reinicia con cada deploy — es la naturaleza de un monitor en vivo.
export interface MuestraRequest {
  ts: number;
  metodo: string;
  ruta: string; // patrón de ruta (…/:id), nunca la URL completa con ids/PII
  grupo: string;
  status: number;
  ms: number;
  usuarioId?: string;
  empresaId?: string;
  origen: 'tenant' | 'admin' | 'portal' | 'publico';
}

const VENTANA_MS = 10 * 60_000;
const MAX_MUESTRAS = 20_000;
const SERIE_BUCKETS = 12; // gráfico "tiempo real": 12 puntos de 5s = 60s
const SERIE_BUCKET_MS = 5_000;
const ACTIVIDAD_MAX = 25;
const VENTANA_SERVICIOS_MS = 5 * 60_000;
const VENTANA_SESIONES_MS = 5 * 60_000;

// Segmento de ruta → servicio lógico. El primer patrón que matchea gana.
const GRUPOS: Array<{ test: RegExp; nombre: string; tipo: string }> = [
  { test: /^admin\/monitor\b/, nombre: 'API Monitor', tipo: 'API' },
  { test: /^(auth|admin\/auth)\b/, nombre: 'API Autenticación', tipo: 'API' },
  { test: /^(portal-proveedor|portal)\b/, nombre: 'Portal B2B', tipo: 'API' },
  { test: /^admin\b/, nombre: 'API SuperAdmin', tipo: 'API' },
  { test: /^(inventario|productos|almacenes|movimientos|kardex|lotes|categorias|ubicaciones|inventarios-fisicos|capas-costo)\b/, nombre: 'API Inventario', tipo: 'API' },
  { test: /^(despachos|pedidos-internos|pedidos-portal|picking|rutas|transporte|flota|empaques|proyectos|cdr|guias-remision)\b/, nombre: 'API Despachos', tipo: 'API' },
  { test: /^(proformas|facturas-b2b|cuentas-por-cobrar|cxc|sunat|listas-precios|oportunidades|ordenes-compra|cotizaciones)\b/, nombre: 'API Compras y Ventas', tipo: 'API' },
  { test: /^(public|health)\b/, nombre: 'API Pública', tipo: 'API' },
];

function grupoDeRuta(ruta: string): { nombre: string; tipo: string } {
  const limpia = ruta.replace(/^\/?api\//, '').replace(/^\//, '');
  for (const g of GRUPOS) if (g.test.test(limpia)) return { nombre: g.nombre, tipo: g.tipo };
  return { nombre: 'API General', tipo: 'API' };
}

type EstadoServicio = 'operativo' | 'degradado' | 'caido' | 'sin_trafico';

export interface ServicioSalud {
  nombre: string;
  tipo: string;
  latenciaMs: number;
  p95Ms: number;
  reqPorMin: number;
  exitoPct: number;
  estado: EstadoServicio;
}

@Injectable()
export class MonitorService {
  private readonly logger = new Logger('MonitorService');
  private muestras: MuestraRequest[] = [];

  constructor(private readonly prisma: PrismaService) {}

  // ── Ingesta (llamado por MonitorInterceptor en cada request) ──────────
  registrar(m: Omit<MuestraRequest, 'grupo'>) {
    const { nombre } = grupoDeRuta(m.ruta);
    this.muestras.push({ ...m, grupo: nombre });
    const corte = Date.now() - VENTANA_MS;
    let i = 0;
    while (i < this.muestras.length && this.muestras[i].ts < corte) i++;
    if (i > 0) this.muestras.splice(0, i);
    if (this.muestras.length > MAX_MUESTRAS) this.muestras.splice(0, this.muestras.length - MAX_MUESTRAS);
  }

  // ── Snapshot para el panel ───────────────────────────────────────────
  async resumen() {
    const ahora = Date.now();
    const ultimoMin = this.muestras.filter((m) => m.ts >= ahora - 60_000);
    const total = ultimoMin.length;
    const errores = ultimoMin.filter((m) => m.status >= 500).length;
    const lats = ultimoMin.map((m) => m.ms).sort((a, b) => a - b);

    const sesionesActivas = new Set(
      this.muestras.filter((m) => m.ts >= ahora - VENTANA_SESIONES_MS && m.usuarioId).map((m) => m.usuarioId),
    ).size;

    // Serie de 12 buckets de 5s (los últimos 60s).
    const serie = Array.from({ length: SERIE_BUCKETS }, (_, idx) => {
      const finBucket = ahora - (SERIE_BUCKETS - 1 - idx) * SERIE_BUCKET_MS;
      const iniBucket = finBucket - SERIE_BUCKET_MS;
      const enBucket = this.muestras.filter((m) => m.ts > iniBucket && m.ts <= finBucket);
      const segundos = (SERIE_BUCKETS - idx) * 5;
      return {
        label: `T-${segundos}s`,
        peticiones: enBucket.length,
        latenciaMs: enBucket.length ? Math.round(promedio(enBucket.map((m) => m.ms))) : 0,
      };
    });

    const actividadCruda = this.muestras.slice(-ACTIVIDAD_MAX).reverse();
    const empresaIds = [...new Set(actividadCruda.map((m) => m.empresaId).filter(Boolean))] as string[];
    const nombres = empresaIds.length
      ? new Map(
          (await this.prisma.empresa.findMany({ where: { id: { in: empresaIds } }, select: { id: true, nombre: true } })).map(
            (e) => [e.id, e.nombre],
          ),
        )
      : new Map<string, string>();
    const actividad = actividadCruda.map((m) => ({
      ts: m.ts,
      metodo: m.metodo,
      ruta: m.ruta,
      status: m.status,
      ms: Math.round(m.ms),
      origen: m.origen,
      empresa: m.empresaId ? nombres.get(m.empresaId) ?? null : null,
    }));

    const servicios = await this.calcularServicios();
    const tendencia = this.tendenciaSerie(serie);

    return {
      generadoAt: new Date(ahora).toISOString(),
      kpis: {
        peticionesPorMin: total,
        latenciaPromedioMs: total ? Math.round(promedio(lats)) : 0,
        latenciaP95Ms: total ? Math.round(percentil(lats, 95)) : 0,
        tasaErrorPct: total ? +((100 * errores) / total).toFixed(2) : 0,
        sesionesActivas,
      },
      serie,
      tendencia, // 'estable' | 'subiendo' | 'bajando'
      actividad,
      servicios,
      serviciosConIncidencia: servicios.filter((s) => s.estado === 'degradado' || s.estado === 'caido').length,
    };
  }

  private tendenciaSerie(serie: Array<{ peticiones: number }>): 'estable' | 'subiendo' | 'bajando' {
    if (serie.length < 4) return 'estable';
    const mitad = Math.floor(serie.length / 2);
    const a = promedio(serie.slice(0, mitad).map((s) => s.peticiones)) || 0;
    const b = promedio(serie.slice(mitad).map((s) => s.peticiones)) || 0;
    if (a === 0 && b === 0) return 'estable';
    const delta = a === 0 ? 1 : (b - a) / a;
    if (delta > 0.15) return 'subiendo';
    if (delta < -0.15) return 'bajando';
    return 'estable';
  }

  /** Salud por servicio lógico sobre la ventana de 5 min + sonda real a la BD. */
  private async calcularServicios(): Promise<ServicioSalud[]> {
    const ahora = Date.now();
    const ventana = this.muestras.filter((m) => m.ts >= ahora - VENTANA_SERVICIOS_MS);
    const porGrupo = new Map<string, MuestraRequest[]>();
    for (const g of GRUPOS) if (g.nombre !== 'API Monitor') porGrupo.set(g.nombre, []);
    porGrupo.set('API General', []);
    for (const m of ventana) {
      if (m.grupo === 'API Monitor') continue; // el propio polling del panel no es "salud de la plataforma"
      if (!porGrupo.has(m.grupo)) porGrupo.set(m.grupo, []);
      porGrupo.get(m.grupo)!.push(m);
    }

    const apis: ServicioSalud[] = [...porGrupo.entries()]
      .map(([nombre, ms]) => {
        const n = ms.length;
        const err = ms.filter((x) => x.status >= 500).length;
        const lats = ms.map((x) => x.ms).sort((a, b) => a - b);
        const p95 = n ? percentil(lats, 95) : 0;
        const avg = n ? promedio(lats) : 0;
        const errRatio = n ? err / n : 0;
        let estado: EstadoServicio = 'sin_trafico';
        if (n > 0) {
          if (errRatio >= 0.5) estado = 'caido';
          else if (errRatio >= 0.05 || p95 >= 1000 || avg >= 500) estado = 'degradado';
          else estado = 'operativo';
        }
        return {
          nombre,
          tipo: 'API',
          latenciaMs: Math.round(avg),
          p95Ms: Math.round(p95),
          reqPorMin: Math.round(n / 5),
          exitoPct: n ? +(100 * (1 - errRatio)).toFixed(2) : 100,
          estado,
        };
      })
      .filter((s) => s.estado !== 'sin_trafico' || ['API Autenticación', 'API SuperAdmin'].includes(s.nombre));

    apis.sort((a, b) => rankEstado(a.estado) - rankEstado(b.estado) || b.reqPorMin - a.reqPorMin);

    return [...apis, await this.sondaBaseDatos()];
  }

  private async sondaBaseDatos(): Promise<ServicioSalud> {
    const t0 = performance.now();
    let ok = true;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      ok = false;
    }
    const ms = Math.round(performance.now() - t0);
    const estado: EstadoServicio = !ok ? 'caido' : ms >= 250 ? 'degradado' : 'operativo';
    return { nombre: 'Base de datos', tipo: 'Base de datos', latenciaMs: ms, p95Ms: ms, reqPorMin: 0, exitoPct: ok ? 100 : 0, estado };
  }

  incidentes() {
    return this.prisma.incidenteMonitor.findMany({ orderBy: { inicioAt: 'desc' }, take: 40 });
  }

  // ── Detección automática de incidentes (cada minuto) ──────────────────
  @Cron(CronExpression.EVERY_MINUTE)
  async evaluarIncidentes() {
    if (this.muestras.length === 0) return; // sin tráfico observado, nada que evaluar
    const servicios = await this.calcularServicios();
    const abiertos = await this.prisma.incidenteMonitor.findMany({ where: { resueltoAt: null } });
    const abiertoPorServicio = new Map(abiertos.map((i) => [i.servicio, i]));

    for (const s of servicios) {
      const enIncidente = s.estado === 'degradado' || s.estado === 'caido';
      const abierto = abiertoPorServicio.get(s.nombre);

      if (enIncidente && !abierto) {
        await this.prisma.incidenteMonitor.create({
          data: {
            servicio: s.nombre,
            tipo: s.tipo,
            severidad: s.estado,
            detalle: `Latencia p95 ${s.p95Ms} ms · éxito ${s.exitoPct}% · ${s.reqPorMin} req/min`,
          },
        });
        await this.auditar('incidente_abierto', s.nombre, `${s.nombre} pasó a ${s.estado}`);
        this.logger.warn(`Incidente abierto: ${s.nombre} (${s.estado})`);
      } else if (enIncidente && abierto && abierto.severidad !== s.estado) {
        await this.prisma.incidenteMonitor.update({ where: { id: abierto.id }, data: { severidad: s.estado } });
      } else if (!enIncidente && s.estado === 'operativo' && abierto) {
        await this.prisma.incidenteMonitor.update({ where: { id: abierto.id }, data: { resueltoAt: new Date() } });
        await this.auditar('incidente_resuelto', s.nombre, `${s.nombre} volvió a operativo`);
        this.logger.log(`Incidente resuelto: ${s.nombre}`);
      }
    }
  }

  private auditar(accion: string, servicio: string, detalle: string) {
    return this.prisma.auditoriaPlataforma
      .create({
        data: { adminEmail: 'sistema (monitor)', accion, recurso: 'monitor', recursoId: servicio, detalle },
      })
      .catch(() => undefined);
  }
}

function promedio(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}
function percentil(ordenados: number[], p: number): number {
  if (!ordenados.length) return 0;
  const idx = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1);
  return ordenados[Math.max(0, idx)];
}
function rankEstado(e: EstadoServicio): number {
  return { caido: 0, degradado: 1, operativo: 2, sin_trafico: 3 }[e];
}
