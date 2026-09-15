import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ActualizarBackupLocalDirDto,
  ActualizarEstadoRespaldoDto,
  EjecutarRestauracionDto,
  RechazarRestauracionDto,
  RegistrarAprobacionDto,
  SolicitarRestauracionDto,
  VerificarIntegridadDto,
} from './dto/backups.dto';
import { CrearRespaldoDto } from './dto/crear-respaldo.dto';
import { IngestarRespaldoDto, PruebaRestauracionDto, ResultadoRestauracionDto } from './dto/ingesta.dto';
import { GithubActionsService, WORKFLOW_BACKUP, WORKFLOW_RESTORE_TENANT } from './github-actions.service';

// Ventana mínima entre dos disparos manuales de "backup ahora" — evita
// encolar runners de GitHub por doble click o impaciencia del SuperAdmin.
const BACKUP_DISPATCH_COOLDOWN_MIN = 10;

// Sin backup COMPLETADO más nuevo que esto ⇒ el cron nocturno se cayó.
const BACKUP_MAX_EDAD_HORAS = 26;

// Nombre de la repository variable que leen los 3 workflows de backup cuando
// no hay BACKUP_STORAGE_BUCKET (ver docs/BACKUP-RESTORE.md §8).
const BACKUP_LOCAL_DIR_VAR = 'BACKUP_LOCAL_DIR';

const ALCANCE_LABEL: Record<string, string> = {
  base_datos: 'Base de datos',
  base_datos_archivos: 'Base de datos y archivos',
  configuracion: 'Configuración SaaS',
  plataforma_completa: 'Plataforma completa',
};

/**
 * Destino "contratado" de un negocio. Hoy es una convención (no hay campo en
 * Empresa): todos van a un Object Storage regional. Se snapshotea en el
 * respaldo por si esto se vuelve configurable por negocio.
 */
function destinoDeNegocio(empresa: { nombre: string }) {
  return {
    nombre: `Ubicación contratada · ${empresa.nombre}`,
    region: destinoRegion(),
    retencionDias: 90,
  };
}

/**
 * Ubicación real del artefacto: el bucket configurado, o — sin
 * BACKUP_STORAGE_BUCKET — la carpeta local del runner self-hosted
 * (ver docs/BACKUP-RESTORE.md §8). El API (Render) no ve BACKUP_LOCAL_DIR
 * del job (vive como variable de GitHub Actions, no como env del API), así
 * que no puede mostrar la ruta exacta, solo que es local.
 */
function destinoRegion(): string {
  const bucket = process.env.BACKUP_STORAGE_BUCKET;
  return bucket ? `Object Storage · ${bucket}` : 'Almacenamiento local (equipo del operador)';
}

function destinoPlataforma() {
  return { nombre: 'Respaldo de plataforma completa', region: destinoRegion(), retencionDias: 365 };
}

const RESP_INCLUDE = {
  empresa: { select: { nombre: true, codigo: true } },
} as const;

type RespaldoRow = Prisma.RespaldoNegocioGetPayload<{ include: typeof RESP_INCLUDE }>;
type RestauracionRow = Prisma.SolicitudRestauracionGetPayload<{
  include: { empresa: { select: { nombre: true } }; respaldo: { select: { alcance: true; tamanoBytes: true; createdAt: true } } };
}>;

@Injectable()
export class BackupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly github: GithubActionsService,
  ) {}

  // ── Respaldos ──────────────────────────────────────────────────────────

  async findAll(filtros: { estado?: string; integridad?: string; empresaId?: string; busqueda?: string; page?: number; pageSize?: number } = {}) {
    const page = Math.max(1, filtros.page ?? 1);
    const pageSize = Math.min(Math.max(1, filtros.pageSize ?? 25), 100);

    const and: Prisma.RespaldoNegocioWhereInput[] = [];
    if (filtros.estado) and.push({ estado: filtros.estado as Prisma.EnumEstadoRespaldoFilter['equals'] });
    if (filtros.integridad) and.push({ integridad: filtros.integridad as Prisma.EnumIntegridadRespaldoFilter['equals'] });
    if (filtros.empresaId) and.push({ empresaId: filtros.empresaId });
    if (filtros.busqueda?.trim()) {
      const q = filtros.busqueda.trim();
      and.push({
        OR: [
          { destinoNombre: { contains: q, mode: 'insensitive' } },
          { alcance: { contains: q, mode: 'insensitive' } },
          { empresa: { is: { nombre: { contains: q, mode: 'insensitive' } } } },
        ],
      });
    }
    const where: Prisma.RespaldoNegocioWhereInput = and.length ? { AND: and } : {};

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.respaldoNegocio.findMany({ where, include: RESP_INCLUDE, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.respaldoNegocio.count({ where }),
    ]);
    return { items: rows.map((r) => this.mapRespaldo(r)), total, page, pageSize };
  }

  async resumen() {
    // Conteos en BD en vez de traer todas las filas y filtrar en Node.
    const [total, completados, verificados, sinCifrar, restauracionesPendientes, ultimoGlobal, ultimoTenant, ultimaPrueba, ultimoDispatch] =
      await this.prisma.$transaction([
        this.prisma.respaldoNegocio.count(),
        this.prisma.respaldoNegocio.count({ where: { estado: 'COMPLETADO' } }),
        this.prisma.respaldoNegocio.count({ where: { integridad: 'VERIFICADO' } }),
        this.prisma.respaldoNegocio.count({ where: { cifrado: false } }),
        this.prisma.solicitudRestauracion.count({
          where: { estado: { in: ['PENDIENTE_APROBACION', 'APROBADA', 'EN_EJECUCION'] } },
        }),
        this.prisma.respaldoNegocio.findFirst({
          where: { estado: 'COMPLETADO', empresaId: null },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        this.prisma.respaldoNegocio.findFirst({
          where: { estado: 'COMPLETADO', empresaId: { not: null } },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        this.prisma.pruebaRestauracion.findFirst({ orderBy: { ejecutadaEn: 'desc' } }),
        this.prisma.eventoRespaldo.findFirst({ where: { tipo: 'backup_dispatch' }, orderBy: { fecha: 'desc' }, select: { fecha: true } }),
      ]);

    const ultimoBackupAt =
      [ultimoGlobal?.createdAt, ultimoTenant?.createdAt].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;
    const edadHoras = ultimoBackupAt ? (Date.now() - ultimoBackupAt.getTime()) / 3_600_000 : Infinity;

    return {
      total,
      completados,
      verificados,
      restauracionesPendientes,
      cifradoActivo: total > 0 && sinCifrar === 0,
      ultimoBackupAt,
      ultimoBackupPlataformaAt: ultimoGlobal?.createdAt ?? null,
      ultimoBackupTenantAt: ultimoTenant?.createdAt ?? null,
      backupAtrasado: edadHoras > BACKUP_MAX_EDAD_HORAS,
      // Último "Ejecutar backup ahora" disparado desde el panel — puede ser
      // más nuevo que `ultimoBackupAt` mientras el job todavía está corriendo.
      ultimoDispatchBackupAt: ultimoDispatch?.fecha ?? null,
      ultimaPrueba: ultimaPrueba
        ? { resultado: ultimaPrueba.resultado, ejecutadaEn: ultimaPrueba.ejecutadaEn, detalle: ultimaPrueba.detalle }
        : null,
    };
  }

  /** Estado de la integración con GitHub Actions — para que el panel deshabilite botones con tooltip en vez de fallar al clickear. */
  automatizacion() {
    const { disponible, motivo, repo } = this.github.estado();
    return {
      disponible,
      motivo,
      repo,
      urlBackup: this.github.urlWorkflow(WORKFLOW_BACKUP),
      urlRestauracion: this.github.urlWorkflow(WORKFLOW_RESTORE_TENANT),
    };
  }

  /** Carpeta local (runner self-hosted) donde cae el backup cuando no hay object storage configurado. */
  async configuracionLocalDir() {
    const valor = await this.github.getVariable(BACKUP_LOCAL_DIR_VAR);
    return { valor };
  }

  /** Actualiza la repository variable BACKUP_LOCAL_DIR en GitHub — la leen los 3 workflows en la próxima corrida. */
  async actualizarLocalDir(dto: ActualizarBackupLocalDirDto, actor: string) {
    await this.github.setVariable(BACKUP_LOCAL_DIR_VAR, dto.valor);
    await this.prisma.eventoRespaldo.create({
      data: {
        tipo: 'configuracion_local_dir',
        detalle: `Carpeta local de destino de los backups actualizada a "${dto.valor}" desde el panel.`,
        actor,
      },
    });
    return { ok: true, valor: dto.valor };
  }

  /** Dispara el workflow nocturno a demanda — el resultado lo reportan backup-full.mjs/backup-tenant.mjs por el canal de ingesta, sin cambios acá. */
  async dispararBackupAhora(actor: string) {
    const ultimo = await this.prisma.eventoRespaldo.findFirst({
      where: { tipo: 'backup_dispatch' },
      orderBy: { fecha: 'desc' },
      select: { fecha: true },
    });
    if (ultimo) {
      const minutos = (Date.now() - ultimo.fecha.getTime()) / 60_000;
      if (minutos < BACKUP_DISPATCH_COOLDOWN_MIN) {
        throw new ConflictException(
          `Ya se disparó un backup hace ${Math.ceil(minutos)} minuto(s). Esperá a que termine antes de pedir otro.`,
        );
      }
    }

    await this.github.dispatch(WORKFLOW_BACKUP); // primero GitHub — si falla, no queda un evento mentiroso

    await this.prisma.eventoRespaldo.create({
      data: {
        tipo: 'backup_dispatch',
        detalle: 'Backup completo + export por negocio solicitado desde el panel (GitHub Actions)',
        actor,
      },
    });
    return { ok: true, despachadoEn: new Date(), url: this.github.urlWorkflow(WORKFLOW_BACKUP) };
  }

  async findOne(id: string) {
    const r = await this.prisma.respaldoNegocio.findUnique({
      where: { id },
      include: {
        ...RESP_INCLUDE,
        eventos: { orderBy: { fecha: 'desc' } },
        restauraciones: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!r) throw new NotFoundException('Respaldo no encontrado');
    return {
      ...this.mapRespaldo(r),
      eventos: r.eventos.map((e) => ({ id: e.id, tipo: e.tipo, detalle: e.detalle, actor: e.actor, fecha: e.fecha })),
      restauraciones: r.restauraciones.map((s) => this.mapRestauracionBasica(s)),
    };
  }

  async crear(dto: CrearRespaldoDto, actor: string) {
    const empresa = await this.prisma.empresa.findUnique({ where: { id: dto.empresaId }, select: { id: true, nombre: true } });
    if (!empresa) throw new BadRequestException('La empresa indicada no existe');

    const destino = destinoDeNegocio(empresa);
    const estado = (dto.estado ?? 'VALIDANDO') as 'VALIDANDO' | 'COMPLETADO' | 'FALLIDO';
    const cifrado = dto.cifrado ?? true;

    const respaldo = await this.prisma.respaldoNegocio.create({
      data: {
        empresaId: dto.empresaId,
        alcance: dto.alcance,
        estado,
        integridad: 'PENDIENTE',
        tamanoBytes: dto.tamanoBytes != null ? BigInt(dto.tamanoBytes) : null,
        destinoNombre: destino.nombre,
        destinoRegion: destino.region,
        retencionDias: dto.retencionDias ?? destino.retencionDias,
        cifrado,
        creadoPor: actor,
        nota: dto.nota?.trim() || null,
        eventos: {
          create: {
            tipo: 'respaldo_creado',
            detalle: `${ALCANCE_LABEL[dto.alcance] ?? dto.alcance} registrado en ${destino.nombre}`,
            actor,
            empresaId: dto.empresaId,
          },
        },
      },
      include: RESP_INCLUDE,
    });
    return this.mapRespaldo(respaldo);
  }

  // ── Ingesta desde el job externo (token de servicio, no SuperAdmin) ────

  /** El job reportó un respaldo ya tomado y subido al object storage. */
  async ingestarRespaldo(dto: IngestarRespaldoDto) {
    let destino: { nombre: string; region: string; retencionDias: number };
    if (dto.empresaId) {
      const empresa = await this.prisma.empresa.findUnique({ where: { id: dto.empresaId }, select: { nombre: true } });
      if (!empresa) throw new BadRequestException(`El negocio "${dto.empresaId}" no existe`);
      destino = destinoDeNegocio(empresa);
    } else {
      destino = destinoPlataforma();
    }

    const estado = (dto.estado ?? 'COMPLETADO') as 'COMPLETADO' | 'FALLIDO';
    const actor = 'sistema (job de backup)';
    const etiqueta = ALCANCE_LABEL[dto.alcance] ?? dto.alcance;

    const respaldo = await this.prisma.respaldoNegocio.create({
      data: {
        empresaId: dto.empresaId ?? null,
        alcance: dto.alcance,
        estado,
        integridad: 'PENDIENTE',
        origen: 'automatico',
        formato: dto.formato,
        storageKey: dto.storageKey,
        checksum: dto.checksum ?? null,
        tamanoBytes: dto.tamanoBytes != null ? BigInt(dto.tamanoBytes) : null,
        destinoNombre: destino.nombre,
        destinoRegion: destino.region,
        retencionDias: dto.retencionDias ?? destino.retencionDias,
        cifrado: true,
        creadoPor: actor,
        createdAt: dto.tomadoEn ? new Date(dto.tomadoEn) : undefined,
        nota: dto.nota?.trim() || null,
        eventos: {
          create: {
            tipo: estado === 'FALLIDO' ? 'respaldo_fallido' : 'respaldo_creado',
            detalle:
              estado === 'FALLIDO'
                ? `El job reportó un fallo generando el respaldo ${etiqueta}${dto.nota ? ` — ${dto.nota}` : ''}`
                : `${etiqueta} subido a ${dto.storageKey}`,
            actor,
            empresaId: dto.empresaId ?? null,
          },
        },
      },
      include: RESP_INCLUDE,
    });
    return this.mapRespaldo(respaldo);
  }

  /** Datos mínimos que el script `restore-tenant.mjs` necesita de una solicitud. */
  async leerSolicitudParaRestore(id: string) {
    const s = await this.prisma.solicitudRestauracion.findUnique({
      where: { id },
      include: {
        empresa: { select: { codigo: true, nombre: true } },
        respaldo: { select: { storageKey: true, checksum: true, formato: true, alcance: true } },
      },
    });
    if (!s) throw new NotFoundException('Solicitud de restauración no encontrada');
    return {
      id: s.id,
      estado: s.estado,
      empresaId: s.empresaId,
      empresaCodigo: s.empresa?.codigo ?? null,
      motivo: s.motivo,
      aprobacionEvidencia: s.aprobacionEvidencia,
      respaldo: s.respaldo,
    };
  }

  /**
   * El script `restore-tenant.mjs` terminó una restauración: cierra la
   * SolicitudRestauracion (RESTAURADA si ok; queda APROBADA + evento si falló)
   * y adjunta el log y el "snapshot previo".
   */
  async registrarResultadoRestauracion(dto: ResultadoRestauracionDto) {
    const s = await this.prisma.solicitudRestauracion.findUnique({ where: { id: dto.solicitudId } });
    if (!s) throw new NotFoundException('Solicitud de restauración no encontrada');
    if (s.estado !== 'APROBADA' && s.estado !== 'EN_EJECUCION') {
      throw new BadRequestException(`La solicitud está en ${s.estado}; se esperaba APROBADA/EN_EJECUCION`);
    }

    const notaSnapshot = dto.snapshotStorageKey ? `\nSnapshot previo: ${dto.snapshotStorageKey}` : '';
    return this.actualizarRestauracion(
      dto.solicitudId,
      dto.resultado === 'ok'
        ? { estado: 'RESTAURADA', ejecutadoEn: new Date(), nota: `${dto.log}${notaSnapshot}` }
        : { estado: 'APROBADA', nota: `Intento fallido: ${dto.log}${notaSnapshot}` },
      {
        tipo: dto.resultado === 'ok' ? 'restauracion_ejecutada' : 'restauracion_fallida',
        detalle: dto.resultado === 'ok' ? 'Restauración ejecutada por script (con evidencia de aprobación)' : `Restauración FALLÓ: ${dto.log.slice(0, 300)}`,
        actor: 'sistema (restore-tenant.mjs)',
      },
    );
  }

  /** El job de CI reportó el resultado del test de restauración periódico. */
  async registrarPruebaRestauracion(dto: PruebaRestauracionDto) {
    const prueba = await this.prisma.pruebaRestauracion.create({
      data: {
        resultado: dto.resultado,
        detalle: dto.detalle ?? null,
        dumpProbado: dto.dumpProbado ?? null,
        duracionMs: dto.duracionMs ?? null,
      },
    });
    await this.prisma.eventoRespaldo.create({
      data: {
        tipo: 'prueba_restauracion',
        detalle:
          dto.resultado === 'ok'
            ? `Test de restauración OK${dto.dumpProbado ? ` (dump ${dto.dumpProbado})` : ''}`
            : `Test de restauración FALLÓ${dto.detalle ? `: ${dto.detalle}` : ''}`,
        actor: 'sistema (CI)',
      },
    });
    return prueba;
  }

  async verificarIntegridad(id: string, dto: VerificarIntegridadDto, actor: string) {
    const r = await this.getRespaldo(id);
    const integridad = dto.resultado as 'VERIFICADO' | 'CON_OBSERVACIONES' | 'PENDIENTE';
    // Verificar OK sobre un respaldo que estaba "validando" lo da por completado.
    const estado = integridad === 'VERIFICADO' && r.estado === 'VALIDANDO' ? 'COMPLETADO' : r.estado;

    const actualizado = await this.prisma.respaldoNegocio.update({
      where: { id },
      data: {
        integridad,
        estado,
        eventos: {
          create: {
            tipo: 'integridad_verificada',
            detalle: `Comprobación de restaurabilidad: ${integridad.toLowerCase().replace('_', ' ')}${dto.nota ? ` — ${dto.nota}` : ''}`,
            actor,
            empresaId: r.empresaId,
          },
        },
      },
      include: RESP_INCLUDE,
    });
    return this.mapRespaldo(actualizado);
  }

  async actualizarEstado(id: string, dto: ActualizarEstadoRespaldoDto, actor: string) {
    const r = await this.getRespaldo(id);
    const actualizado = await this.prisma.respaldoNegocio.update({
      where: { id },
      data: {
        estado: dto.estado as 'VALIDANDO' | 'COMPLETADO' | 'FALLIDO',
        eventos: {
          create: {
            tipo: 'estado_actualizado',
            detalle: `Estado del respaldo: ${dto.estado.toLowerCase()}${dto.nota ? ` — ${dto.nota}` : ''}`,
            actor,
            empresaId: r.empresaId,
          },
        },
      },
      include: RESP_INCLUDE,
    });
    return this.mapRespaldo(actualizado);
  }

  // ── Restauraciones ─────────────────────────────────────────────────────

  async listarRestauraciones(filtros: { estado?: string; empresaId?: string } = {}) {
    const rows = await this.prisma.solicitudRestauracion.findMany({
      where: {
        ...(filtros.estado && { estado: filtros.estado as Prisma.EnumEstadoRestauracionFilter['equals'] }),
        ...(filtros.empresaId && { empresaId: filtros.empresaId }),
      },
      orderBy: { createdAt: 'desc' },
      take: 200, // tope de seguridad; el panel lo consume como lista
      include: {
        empresa: { select: { nombre: true } },
        respaldo: { select: { alcance: true, tamanoBytes: true, createdAt: true } },
      },
    });
    return rows.map((s) => this.mapRestauracion(s));
  }

  async solicitarRestauracion(respaldoId: string, dto: SolicitarRestauracionDto, actor: string) {
    const respaldo = await this.getRespaldo(respaldoId);
    if (respaldo.estado !== 'COMPLETADO') {
      throw new BadRequestException('Solo se puede restaurar desde un respaldo COMPLETADO');
    }
    if (!respaldo.empresaId) {
      throw new BadRequestException(
        'Este respaldo es de toda la plataforma. Una restauración de plataforma completa es un procedimiento de infraestructura (ver docs/BACKUP-RESTORE.md), no se gestiona por este flujo.',
      );
    }

    const solicitud = await this.prisma.solicitudRestauracion.create({
      data: {
        respaldoId,
        empresaId: respaldo.empresaId,
        motivo: dto.motivo.trim(),
        solicitadoPor: actor,
        nota: dto.nota?.trim() || null,
        eventos: {
          create: {
            tipo: 'restauracion_solicitada',
            detalle: 'Solicitud creada; espera aprobación documentada del cliente',
            actor,
            respaldoId,
            empresaId: respaldo.empresaId,
          },
        },
      },
      include: {
        empresa: { select: { nombre: true } },
        respaldo: { select: { alcance: true, tamanoBytes: true, createdAt: true } },
      },
    });
    return this.mapRestauracion(solicitud);
  }

  async registrarAprobacion(id: string, dto: RegistrarAprobacionDto, actor: string) {
    const s = await this.getRestauracion(id);
    if (s.estado !== 'PENDIENTE_APROBACION') {
      throw new BadRequestException(`La solicitud está en estado ${s.estado}; solo se aprueba una PENDIENTE_APROBACION`);
    }
    return this.actualizarRestauracion(id, {
      estado: 'APROBADA',
      aprobacionContacto: dto.contacto.trim(),
      aprobacionEvidencia: dto.evidencia.trim(),
      aprobadoEn: new Date(),
      nota: dto.nota?.trim() || s.nota,
    }, {
      tipo: 'aprobacion_registrada',
      detalle: `Aprobación del cliente registrada: ${dto.evidencia.trim()} (contacto: ${dto.contacto.trim()})`,
      actor,
    });
  }

  /**
   * Dispara de verdad la restauración (workflow_dispatch en GitHub Actions).
   * NO ejecuta nada acá — igual que el resto del sistema, el API solo pide y
   * gobierna; `restore-tenant.mjs` corre en el job y cierra el ciclo llamando
   * a `registrarResultadoRestauracion()` (más abajo, sin cambios).
   */
  async ejecutarRestauracion(id: string, dto: EjecutarRestauracionDto, actor: string) {
    const s = await this.getRestauracion(id);
    if (s.estado !== 'APROBADA') {
      throw new BadRequestException('La restauración debe estar APROBADA (con evidencia del cliente) antes de ejecutarse');
    }
    if (!s.aprobacionEvidencia?.trim()) {
      throw new BadRequestException('La solicitud no tiene evidencia de aprobación registrada');
    }

    const [empresa, respaldo, enCurso] = await Promise.all([
      this.prisma.empresa.findUnique({ where: { id: s.empresaId }, select: { nombre: true } }),
      this.prisma.respaldoNegocio.findUnique({ where: { id: s.respaldoId }, select: { formato: true, storageKey: true } }),
      this.prisma.solicitudRestauracion.count({ where: { empresaId: s.empresaId, estado: 'EN_EJECUCION' } }),
    ]);
    if (!empresa) throw new NotFoundException('El negocio de esta solicitud ya no existe');
    if (respaldo?.formato !== 'json_tenant' || !respaldo?.storageKey) {
      throw new BadRequestException(
        'El respaldo asociado no es un export por negocio (json_tenant) con ubicación en el storage; no se puede restaurar automáticamente.',
      );
    }
    if (empresa.nombre.trim().toLowerCase() !== dto.confirmacionNombre.trim().toLowerCase()) {
      throw new BadRequestException('Escribe el nombre exacto del negocio para confirmar la restauración');
    }
    if (enCurso > 0) {
      throw new ConflictException('Ya hay una restauración en ejecución para este negocio.');
    }

    // Primero GitHub, recién después la BD: si el dispatch falla, la
    // solicitud se queda tal cual (APROBADA) en vez de mentir EN_EJECUCION.
    await this.github.dispatch(WORKFLOW_RESTORE_TENANT, { solicitud_id: id, confirmacion: 'RESTAURAR' });

    return this.actualizarRestauracion(id, {
      estado: 'EN_EJECUCION',
      despachadoEn: new Date(),
      nota: dto.nota?.trim() || s.nota,
    }, {
      tipo: 'restauracion_dispatch',
      detalle: 'Restauración disparada en GitHub Actions (backup-restore-tenant.yml); esperando el reporte del script',
      actor,
    });
  }

  /**
   * Escotilla de emergencia: vuelve una restauración EN_EJECUCION a APROBADA
   * sin que el job haya reportado — NO cancela nada en GitHub, solo desbloquea
   * el registro (para cuando el job murió sin avisar, ver `despachadoEn`).
   */
  async cancelarEjecucion(id: string, actor: string) {
    const s = await this.getRestauracion(id);
    if (s.estado !== 'EN_EJECUCION') {
      throw new BadRequestException('Solo se puede cancelar una restauración EN_EJECUCION');
    }
    return this.actualizarRestauracion(id, {
      estado: 'APROBADA',
      despachadoEn: null,
    }, {
      tipo: 'restauracion_dispatch_cancelado',
      detalle: 'Ejecución marcada como abandonada desde el panel; el job de GitHub no reportó resultado',
      actor,
    });
  }

  async rechazarRestauracion(id: string, dto: RechazarRestauracionDto, actor: string) {
    const s = await this.getRestauracion(id);
    if (s.estado === 'RESTAURADA' || s.estado === 'RECHAZADA') {
      throw new BadRequestException(`La solicitud ya está ${s.estado}`);
    }
    return this.actualizarRestauracion(id, {
      estado: 'RECHAZADA',
      rechazoMotivo: dto.motivo.trim(),
    }, {
      tipo: 'restauracion_rechazada',
      detalle: `Solicitud rechazada: ${dto.motivo.trim()}`,
      actor,
    });
  }

  // ── Vistas auxiliares ──────────────────────────────────────────────────

  /** "Destino y política": la ubicación de cada negocio + la de plataforma. */
  async destinos() {
    const empresas = await this.prisma.empresa.findMany({
      where: { estado: { notIn: ['archivado'] } },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    });
    const dp = destinoPlataforma();
    return [
      { empresaId: null, empresaNombre: 'Toda la plataforma', destinoNombre: dp.nombre, region: dp.region, retencionDias: dp.retencionDias, cifrado: true },
      ...empresas.map((e) => {
        const d = destinoDeNegocio(e);
        return { empresaId: e.id, empresaNombre: e.nombre, destinoNombre: d.nombre, region: d.region, retencionDias: d.retencionDias, cifrado: true };
      }),
    ];
  }

  async actividad(filtros: { limite?: number } = {}) {
    const take = Math.min(Math.max(1, filtros.limite ?? 100), 300);
    const eventos = await this.prisma.eventoRespaldo.findMany({
      orderBy: { fecha: 'desc' },
      take,
      include: {
        respaldo: { select: { empresa: { select: { nombre: true } } } },
        restauracion: { select: { empresa: { select: { nombre: true } } } },
      },
    });
    return eventos.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      detalle: e.detalle,
      actor: e.actor,
      empresaNombre: e.respaldo?.empresa?.nombre ?? e.restauracion?.empresa?.nombre ?? null,
      fecha: e.fecha,
    }));
  }

  // ── Internos ───────────────────────────────────────────────────────────

  private async getRespaldo(id: string) {
    const r = await this.prisma.respaldoNegocio.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Respaldo no encontrado');
    return r;
  }

  private async getRestauracion(id: string) {
    const s = await this.prisma.solicitudRestauracion.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Solicitud de restauración no encontrada');
    return s;
  }

  private async actualizarRestauracion(
    id: string,
    data: Prisma.SolicitudRestauracionUncheckedUpdateInput,
    evento: { tipo: string; detalle: string; actor: string },
  ) {
    const actual = await this.getRestauracion(id);
    const s = await this.prisma.solicitudRestauracion.update({
      where: { id },
      data: {
        ...data,
        eventos: {
          create: {
            tipo: evento.tipo,
            detalle: evento.detalle,
            actor: evento.actor,
            respaldoId: actual.respaldoId,
            empresaId: actual.empresaId,
          },
        },
      },
      include: {
        empresa: { select: { nombre: true } },
        respaldo: { select: { alcance: true, tamanoBytes: true, createdAt: true } },
      },
    });
    return this.mapRestauracion(s);
  }

  private mapRespaldo(r: RespaldoRow) {
    return {
      id: r.id,
      empresaId: r.empresaId,
      empresaNombre: r.empresaId ? (r.empresa?.nombre ?? 'Negocio eliminado') : 'Toda la plataforma',
      empresaCodigo: r.empresa?.codigo ?? null,
      esPlataforma: r.empresaId == null,
      alcance: r.alcance,
      alcanceLabel: ALCANCE_LABEL[r.alcance] ?? r.alcance,
      estado: r.estado,
      integridad: r.integridad,
      origen: r.origen,
      formato: r.formato,
      storageKey: r.storageKey,
      checksum: r.checksum,
      tamanoBytes: r.tamanoBytes != null ? Number(r.tamanoBytes) : null,
      destinoNombre: r.destinoNombre,
      destinoRegion: r.destinoRegion,
      retencionDias: r.retencionDias,
      cifrado: r.cifrado,
      creadoPor: r.creadoPor,
      nota: r.nota,
      createdAt: r.createdAt,
    };
  }

  private mapRestauracionBasica(s: {
    id: string; estado: string; motivo: string; solicitadoPor: string;
    aprobacionContacto: string | null; aprobacionEvidencia: string | null;
    aprobadoEn: Date | null; despachadoEn: Date | null; ejecutadoEn: Date | null; rechazoMotivo: string | null; createdAt: Date;
  }) {
    return {
      id: s.id,
      estado: s.estado,
      motivo: s.motivo,
      solicitadoPor: s.solicitadoPor,
      aprobacionContacto: s.aprobacionContacto,
      aprobacionEvidencia: s.aprobacionEvidencia,
      aprobadoEn: s.aprobadoEn,
      despachadoEn: s.despachadoEn,
      ejecutadoEn: s.ejecutadoEn,
      rechazoMotivo: s.rechazoMotivo,
      createdAt: s.createdAt,
    };
  }

  private mapRestauracion(s: RestauracionRow) {
    return {
      ...this.mapRestauracionBasica(s),
      respaldoId: s.respaldoId,
      empresaId: s.empresaId,
      empresaNombre: s.empresa?.nombre ?? 'Negocio eliminado',
      respaldoAlcance: s.respaldo?.alcance ? (ALCANCE_LABEL[s.respaldo.alcance] ?? s.respaldo.alcance) : null,
      respaldoTamanoBytes: s.respaldo?.tamanoBytes != null ? Number(s.respaldo.tamanoBytes) : null,
      respaldoCreadoEn: s.respaldo?.createdAt ?? null,
    };
  }
}
