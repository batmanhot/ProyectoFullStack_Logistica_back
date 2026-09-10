import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { humanizarPlataforma, humanizarTenant } from './auditoria-humanizar';

// Cuántos eventos recientes se traen por tenant al ver "Todos los negocios" —
// la tabla `auditoria` tiene RLS, hay que leerla tenant por tenant (withTenant).
const POR_TENANT = 80;
const MAX_TENANTS = 120;

/** Acciones del sistema logístico que merecen "requiere atención" en la vista unificada. */
const ACCIONES_ATENCION_TENANT = ['LOGIN_FAILED', 'DELETE'];

// ── Clasificación derivada (no se persiste) ──────────────────────────────
export type TipoEvento = 'Seguridad' | 'Suscripción' | 'Operación' | 'Soporte' | 'Alerta';
export const TIPOS: TipoEvento[] = ['Seguridad', 'Suscripción', 'Operación', 'Soporte', 'Alerta'];

const REC_SEGURIDAD = ['platformadmins', 'platform-admins', 'seguridad'];
const REC_ALERTA = ['monitor', 'alertas'];
const REC_SUSCRIPCION = ['planes', 'renovaciones', 'facturacion'];

/** `where` de Prisma para filtrar por un tipo derivado. */
function whereDeTipo(tipo?: string): Prisma.AuditoriaPlataformaWhereInput | undefined {
  switch (tipo) {
    case 'Seguridad':
      return { OR: [{ recurso: { in: REC_SEGURIDAD } }, { accion: { contains: 'login', mode: 'insensitive' } }] };
    case 'Alerta':
      return { recurso: { in: REC_ALERTA } };
    case 'Suscripción':
      return { recurso: { in: REC_SUSCRIPCION } };
    case 'Soporte':
      return { accion: { in: ['findOne', 'detalle'] } };
    case 'Operación':
      return {
        recurso: { notIn: [...REC_SEGURIDAD, ...REC_ALERTA, ...REC_SUSCRIPCION] },
        accion: { notIn: ['findOne', 'detalle', 'login'] },
      };
    default:
      return undefined;
  }
}

function clasificar(row: {
  recurso: string;
  accion: string;
  adminEmail: string;
}): { tipo: TipoEvento; resultado: 'exitoso' | 'requiere_atencion' } {
  const rec = (row.recurso || '').toLowerCase();
  const acc = (row.accion || '').toLowerCase();

  let tipo: TipoEvento;
  if (REC_SEGURIDAD.includes(rec) || acc.includes('login') || acc.includes('sesion')) tipo = 'Seguridad';
  else if (REC_ALERTA.includes(rec)) tipo = 'Alerta';
  else if (REC_SUSCRIPCION.includes(rec)) tipo = 'Suscripción';
  else if (acc === 'findone' || acc.includes('consult') || acc.includes('detalle')) tipo = 'Soporte';
  else tipo = 'Operación';

  let resultado: 'exitoso' | 'requiere_atencion' = 'exitoso';
  if (acc === 'incidente_abierto') resultado = 'requiere_atencion';
  else if (rec === 'monitor' && acc !== 'incidente_resuelto') resultado = 'requiere_atencion';
  else if (tipo === 'Alerta' && !acc.includes('resuel') && !acc.includes('reabr') && rec === 'alertas' && ['create', 'update'].includes(acc)) {
    // regla de alerta creada/editada no "requiere atención", es gestión → exitoso
    resultado = 'exitoso';
  }

  return { tipo, resultado };
}

/** Auditoría de acciones de gobierno del PlatformAdmin — la llena PlatformAuditInterceptor. */
@Injectable()
export class AuditoriaPlataformaService {
  private readonly logger = new Logger('AuditoriaPlataformaService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoriaTenant: AuditoriaService,
  ) {}

  async findAll(filtros: {
    tipo?: string;
    busqueda?: string;
    page?: number;
    pageSize?: number;
    desde?: string;
    hasta?: string;
  } = {}) {
    const page = Math.max(1, filtros.page ?? 1);
    const pageSize = Math.min(Math.max(1, filtros.pageSize ?? 25), 100);

    const and: Prisma.AuditoriaPlataformaWhereInput[] = [];
    const wTipo = whereDeTipo(filtros.tipo);
    if (wTipo) and.push(wTipo);
    if (filtros.busqueda) {
      const q = filtros.busqueda.trim();
      and.push({
        OR: [
          { adminEmail: { contains: q, mode: 'insensitive' } },
          { accion: { contains: q, mode: 'insensitive' } },
          { recurso: { contains: q, mode: 'insensitive' } },
          { recursoId: { contains: q, mode: 'insensitive' } },
          { detalle: { contains: q, mode: 'insensitive' } },
          { admin: { is: { nombre: { contains: q, mode: 'insensitive' } } } },
          { empresa: { is: { nombre: { contains: q, mode: 'insensitive' } } } },
        ],
      });
    }
    if (filtros.desde) and.push({ timestamp: { gte: new Date(filtros.desde) } });
    if (filtros.hasta) and.push({ timestamp: { lte: new Date(`${filtros.hasta}T23:59:59.999Z`) } });

    const where: Prisma.AuditoriaPlataformaWhereInput = and.length ? { AND: and } : {};

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditoriaPlataforma.findMany({
        where,
        include: { admin: { select: { nombre: true, email: true } }, empresa: { select: { nombre: true } } },
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditoriaPlataforma.count({ where }),
    ]);

    return {
      items: rows.map((r) => {
        const { tipo, resultado } = clasificar(r);
        const esSistema = (r.adminEmail || '').toLowerCase().startsWith('sistema');
        const h = humanizarPlataforma(r);
        return {
          id: r.id,
          timestamp: r.timestamp,
          ambito: 'plataforma' as const,
          empresaNombre: r.empresa?.nombre ?? null,
          actor: esSistema ? 'Sistema' : r.admin?.nombre || r.adminEmail || 'Sistema',
          accion: h.texto,
          recurso: r.recurso,
          modulo: h.modulo,
          tipo,
          resultado,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  // ── Ámbito "Sistema logístico" — la tabla `auditoria` de los tenants ──────
  /**
   * Auditoría operativa de los negocios (modelo `Auditoria`, con RLS). Con
   * `empresaId` → un tenant puntual, paginado real (reusa AuditoriaService).
   * Sin `empresaId` → los eventos más recientes de TODOS los negocios,
   * mezclados y ordenados (lectura tenant por tenant, tope `POR_TENANT`).
   */
  async sistema(filtros: {
    empresaId?: string;
    busqueda?: string;
    accion?: string;
    modulo?: string;
    page?: number;
    pageSize?: number;
    desde?: string;
    hasta?: string;
  }) {
    const page = Math.max(1, filtros.page ?? 1);
    const pageSize = Math.min(Math.max(1, filtros.pageSize ?? 25), 100);
    const filtrosTenant = {
      busqueda: filtros.busqueda,
      accion: filtros.accion,
      modulo: filtros.modulo,
      desde: filtros.desde,
      hasta: filtros.hasta,
    };

    const mapRow = (r: any, empresaNombre: string | null) => ({
      id: r.id,
      timestamp: r.timestamp,
      ambito: 'sistema' as const,
      empresaNombre,
      actor: r.usuarioNombre || 'Sistema',
      accion: humanizarTenant(r),
      recurso: r.modulo,
      modulo: r.modulo,
      tipo: r.accion,
      resultado: ACCIONES_ATENCION_TENANT.includes(r.accion) ? ('requiere_atencion' as const) : ('exitoso' as const),
    });

    // ── Un negocio puntual ──
    if (filtros.empresaId) {
      const empresa = await this.prisma.empresa.findUnique({
        where: { id: filtros.empresaId },
        select: { nombre: true },
      });
      const res = await this.auditoriaTenant.findAll(filtros.empresaId, filtrosTenant, { page, pageSize });
      return {
        items: res.data.map((r) => mapRow(r, empresa?.nombre ?? null)),
        total: res.total,
        page: res.page,
        pageSize: res.pageSize,
        kpis: res.kpis,
      };
    }

    // ── Todos los negocios (mezcla de recientes) ──
    const empresas = await this.prisma.empresa.findMany({
      where: { estado: { notIn: ['archivado'] } },
      select: { id: true, nombre: true },
      take: MAX_TENANTS,
    });

    const where: Prisma.AuditoriaWhereInput = {
      ...(filtros.accion && { accion: filtros.accion }),
      ...(filtros.modulo && { modulo: filtros.modulo }),
      ...(filtros.busqueda && { detalle: { contains: filtros.busqueda, mode: 'insensitive' } }),
      ...(filtros.desde || filtros.hasta
        ? {
            timestamp: {
              ...(filtros.desde && { gte: new Date(filtros.desde) }),
              ...(filtros.hasta && { lte: new Date(`${filtros.hasta}T23:59:59.999Z`) }),
            },
          }
        : {}),
    };

    const porEmpresa = await Promise.all(
      empresas.map((e) =>
        this.prisma
          .withTenant(e.id, (tx) =>
            tx.auditoria.findMany({
              where: { ...where, empresaId: e.id },
              orderBy: { timestamp: 'desc' },
              take: POR_TENANT,
            }),
          )
          .then((rows) => rows.map((r) => mapRow(r, e.nombre)))
          .catch(() => []),
      ),
    );

    const merged = porEmpresa.flat().sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);
    const kpis = {
      total: merged.length,
      hoy: merged.filter((r) => r.timestamp >= inicioHoy).length,
      errores: merged.filter((r) => r.resultado === 'requiere_atencion').length,
      negocios: new Set(merged.map((r) => r.empresaNombre)).size,
    };

    return {
      items: merged.slice((page - 1) * pageSize, page * pageSize),
      total: merged.length,
      page,
      pageSize,
      kpis,
      parcial: true, // "los últimos N por negocio", no un histórico completo
    };
  }

  async resumen() {
    const [total, requierenAtencion, cfg] = await Promise.all([
      this.prisma.auditoriaPlataforma.count(),
      this.prisma.auditoriaPlataforma.count({ where: { accion: 'incidente_abierto' } }),
      this.prisma.plataformaConfig.findFirst({ select: { retencionAuditoriaDias: true } }),
    ]);
    return { total, requierenAtencion, retencionDias: cfg?.retencionAuditoriaDias ?? 365 };
  }

  /** Purga diaria según la retención configurada (SuperAdmin → Auditoría → Retención). */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgarPorRetencion() {
    const cfg = await this.prisma.plataformaConfig.findFirst({ select: { retencionAuditoriaDias: true } });
    const dias = cfg?.retencionAuditoriaDias ?? 365;
    const corte = new Date(Date.now() - dias * 86_400_000);
    const { count } = await this.prisma.auditoriaPlataforma.deleteMany({ where: { timestamp: { lt: corte } } });
    if (count) this.logger.log(`Bitácora de plataforma: purgadas ${count} fila(s) con más de ${dias} días.`);
    return count;
  }
}
