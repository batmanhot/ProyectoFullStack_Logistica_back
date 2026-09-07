import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertExists } from '../common/utils/assert-exists.util';
import { CreateOportunidadDto } from './dto/create-oportunidad.dto';
import { UpdateOportunidadDto } from './dto/update-oportunidad.dto';
import { RegistrarActividadDto } from './dto/registrar-actividad.dto';
import { CambiarEstadoOportunidadDto } from './dto/cambiar-estado.dto';
import { VincularProformaDto } from './dto/vincular-proforma.dto';
import { EstadoOportunidad } from '@prisma/client';

// Probabilidad sugerida automáticamente al cambiar de estado — editable a
// mano después si el usuario quiere afinarla (campo `probabilidad` de
// Oportunidad no está bloqueado, esto solo define el valor por defecto).
const PROBABILIDAD_POR_ESTADO: Record<EstadoOportunidad, number> = {
  NUEVA: 10,
  CALIFICADA: 30,
  COTIZADA: 60,
  EN_NEGOCIACION: 80,
  GANADA: 100,
  PERDIDA: 0,
  CANCELADA: 0,
};

const ESTADOS_CERRADOS: EstadoOportunidad[] = ['GANADA', 'PERDIDA', 'CANCELADA'];
const ORDEN_ESTADOS: EstadoOportunidad[] = ['NUEVA', 'CALIFICADA', 'COTIZADA', 'EN_NEGOCIACION'];
const ESTADOS_ABIERTOS: EstadoOportunidad[] = ['NUEVA', 'CALIFICADA', 'COTIZADA', 'EN_NEGOCIACION'];

/**
 * Auditoría 2026-09-03: quién hace la llamada, resuelto una sola vez por el
 * controller (`resolverActor`) y pasado a cada método. `esVendedorBase` es
 * el único rol de catálogo restringido a "solo lo propio" — Gerente de
 * Operaciones/Admin/Owner conservan visibilidad completa del pipeline
 * (documentado ya en el seed: "mando operativo, no solo el ejecutivo de
 * ventas"). Limitación conocida: si el tenant crea un rol personalizado que
 * también deba comportarse como vendedor raso, esto no lo cubre — hoy el
 * catálogo de roles no distingue "base" de "gestión" más que por código.
 */
export interface ActorOportunidad {
  usuarioId: string;
  esVendedorBase: boolean;
}

@Injectable()
export class OportunidadesService {
  constructor(private prisma: PrismaService) {}

  async resolverActor(empresaId: string, usuarioId: string, rolId: string): Promise<ActorOportunidad> {
    const rol = await this.prisma.withTenant(empresaId, (tx) =>
      tx.rol.findFirst({ where: { id: rolId, OR: [{ empresaId }, { empresaId: null }] }, select: { codigo: true } }),
    );
    return { usuarioId, esVendedorBase: rol?.codigo === 'ejecutivo-comercial' };
  }

  private asegurarPropia(actor: ActorOportunidad, responsableId: string) {
    if (actor.esVendedorBase && responsableId !== actor.usuarioId) {
      throw new ForbiddenException('No tienes acceso a oportunidades de otro vendedor');
    }
  }

  /**
   * Catálogo mínimo para asignar oportunidades sin exigir acceso
   * administrativo a usuarios. Auditoría 2026-09-03: antes devolvía TODOS
   * los usuarios activos del tenant, incluyendo roles sin acceso al módulo
   * (Almacenero, Chofer, etc.) — asignarle una oportunidad a uno de esos
   * usuarios la dejaba huérfana para él (nunca podría verla ni gestionarla,
   * su rol no tiene el permiso 'oportunidades'). Se filtra a usuarios cuyo
   * rol realmente tiene acceso al módulo (o '*'). Sigue sin restringir por
   * `esVendedorBase` — solo expone id/nombre/meta, nunca detalle de trato,
   * y lo necesita el propio vendedor para leer SU meta en su Dashboard.
   */
  responsables(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.usuario.findMany({
        where: {
          empresaId,
          activo: true,
          rol: { permisos: { some: { modulo: { in: ['oportunidades', '*'] } } } },
        },
        select: { id: true, nombre: true, metaVentasMensual: true },
        orderBy: { nombre: 'asc' },
      }),
    );
  }

  /**
   * Rendimiento agregado por vendedor — endpoint separado de `findAll` a
   * propósito: un vendedor raso puede consultarlo (comparar su cuota contra
   * el equipo es información legítima), pero solo devuelve NÚMEROS
   * agregados por persona, nunca cliente/descripción/contacto de un trato
   * ajeno — eso sigue vedado por `asegurarPropia` en el resto del módulo.
   */
  async rendimientoPorVendedor(empresaId: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const responsablesConAcceso = await tx.usuario.findMany({
        where: {
          empresaId,
          activo: true,
          rol: { permisos: { some: { modulo: { in: ['oportunidades', '*'] } } } },
        },
        select: { id: true, nombre: true, metaVentasMensual: true },
        orderBy: { nombre: 'asc' },
      });
      const todas = await tx.oportunidad.findMany({
        where: { empresaId },
        select: { responsableId: true, estado: true, valorEstimado: true, fechaCierre: true },
      });

      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);

      const porUsuario = new Map(
        responsablesConAcceso.map((u) => [
          u.id,
          {
            id: u.id,
            nombre: u.nombre,
            meta: u.metaVentasMensual,
            abiertas: 0,
            valorPipeline: 0,
            ganadas: 0,
            valorGanado: 0,
            valorGanadoMes: 0,
            perdidas: 0,
          },
        ]),
      );

      for (const op of todas) {
        const r = porUsuario.get(op.responsableId);
        if (!r) continue; // responsable ya no tiene acceso al módulo (rol cambiado/desactivado) — no se muestra
        const valor = Number(op.valorEstimado);
        if (ESTADOS_ABIERTOS.includes(op.estado)) {
          r.abiertas++;
          r.valorPipeline += valor;
        } else if (op.estado === 'GANADA') {
          r.ganadas++;
          r.valorGanado += valor;
          if (op.fechaCierre && op.fechaCierre >= inicioMes) r.valorGanadoMes += valor;
        } else if (op.estado === 'PERDIDA' || op.estado === 'CANCELADA') {
          r.perdidas++;
        }
      }

      return Array.from(porUsuario.values()).sort(
        (a, b) => b.valorGanado - a.valorGanado || b.valorPipeline - a.valorPipeline,
      );
    });
  }

  async findAll(
    empresaId: string,
    actor: ActorOportunidad,
    filtros: { estado?: EstadoOportunidad; responsableId?: string; clienteId?: string },
  ) {
    // Un vendedor raso no elige a quién ver por query param — su pipeline
    // siempre es el propio, sin importar qué mande el cliente HTTP.
    const responsableId = actor.esVendedorBase ? actor.usuarioId : filtros.responsableId;
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.oportunidad.findMany({
        where: {
          empresaId,
          ...(filtros.estado ? { estado: filtros.estado } : {}),
          ...(responsableId ? { responsableId } : {}),
          ...(filtros.clienteId ? { clienteId: filtros.clienteId } : {}),
        },
        include: {
          cliente: { select: { id: true, razonSocial: true, ruc: true } },
          responsable: { select: { id: true, nombre: true } },
          _count: { select: { proformas: true, actividades: true } },
        },
        orderBy: { fechaUltimaActividad: 'desc' },
      }),
    );
  }

  async findOne(empresaId: string, actor: ActorOportunidad, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const op = await assertExists(
        () =>
          tx.oportunidad.findFirst({
            where: { id, empresaId },
            include: {
              cliente: true,
              responsable: { select: { id: true, nombre: true, email: true } },
              proformas: { orderBy: { createdAt: 'desc' } },
              actividades: {
                orderBy: { fecha: 'desc' },
                include: { usuario: { select: { id: true, nombre: true } } },
              },
            },
          }),
        'Oportunidad no encontrada',
        NotFoundException,
      );
      this.asegurarPropia(actor, op.responsableId);
      return op;
    });
  }

  async create(empresaId: string, actor: ActorOportunidad, dto: CreateOportunidadDto) {
    // Un vendedor raso solo puede crear oportunidades para sí mismo —
    // "asignarle un trato a otro vendedor" es la misma acción de gestión
    // que reasignar, vedada para este rol (ver `update`).
    this.asegurarPropia(actor, dto.responsableId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      await assertExists(
        () => tx.cliente.findFirst({ where: { id: dto.clienteId, empresaId } }),
        'El cliente indicado no existe',
      );
      await assertExists(
        () => tx.usuario.findFirst({ where: { id: dto.responsableId, empresaId } }),
        'El responsable indicado no existe',
      );

      const total = await tx.oportunidad.count({ where: { empresaId } });
      const codigo = `OP-${String(total + 1).padStart(5, '0')}`;

      return tx.oportunidad.create({
        data: {
          empresaId,
          codigo,
          clienteId: dto.clienteId,
          contacto: dto.contacto,
          descripcion: dto.descripcion,
          necesidad: dto.necesidad,
          responsableId: dto.responsableId,
          valorEstimado: dto.valorEstimado,
          probabilidad: PROBABILIDAD_POR_ESTADO.NUEVA,
          fuente: dto.fuente,
          fechaEstimadaCierre: dto.fechaEstimadaCierre ? new Date(dto.fechaEstimadaCierre) : null,
          observaciones: dto.observaciones,
        },
        include: {
          cliente: { select: { id: true, razonSocial: true } },
          responsable: { select: { id: true, nombre: true } },
        },
      });
    });
  }

  async update(empresaId: string, actor: ActorOportunidad, id: string, dto: UpdateOportunidadDto) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const actual = await assertExists(
        () => tx.oportunidad.findFirst({ where: { id, empresaId } }),
        'Oportunidad no encontrada',
        NotFoundException,
      );
      this.asegurarPropia(actor, actual.responsableId);
      // Reasignar (cambiar responsableId) es una decisión de gestión de
      // equipo — vedada para el vendedor raso incluso sobre su propia
      // oportunidad (repartir carga/cubrir ausencias es de Gerente/Admin).
      if (actor.esVendedorBase && dto.responsableId !== undefined) {
        throw new ForbiddenException('Solo Gerente de Operaciones, Admin o Propietario pueden reasignar una oportunidad');
      }
      if (ESTADOS_CERRADOS.includes(actual.estado)) {
        throw new BadRequestException(
          'No se puede editar una oportunidad ya cerrada (ganada, perdida o cancelada)',
        );
      }
      if (dto.responsableId) {
        await assertExists(
          () => tx.usuario.findFirst({ where: { id: dto.responsableId, empresaId } }),
          'El responsable indicado no existe',
        );
      }
      return tx.oportunidad.update({
        where: { id },
        data: {
          ...dto,
          fechaEstimadaCierre: dto.fechaEstimadaCierre ? new Date(dto.fechaEstimadaCierre) : undefined,
        },
      });
    });
  }

  async cambiarEstado(empresaId: string, actor: ActorOportunidad, id: string, dto: CambiarEstadoOportunidadDto) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const actual = await assertExists(
        () => tx.oportunidad.findFirst({ where: { id, empresaId } }),
        'Oportunidad no encontrada',
        NotFoundException,
      );
      this.asegurarPropia(actor, actual.responsableId);
      if (ESTADOS_CERRADOS.includes(actual.estado)) {
        throw new BadRequestException('Esta oportunidad ya está cerrada');
      }
      // Una oportunidad se califica solo luego de documentar el primer
      // seguimiento. `fechaUltimaActividad` se actualiza al registrar una
      // ActividadComercial y evita que el pipeline avance sin evidencia.
      if (dto.estado === 'CALIFICADA') {
        if (actual.estado !== 'NUEVA') {
          throw new BadRequestException('Solo una oportunidad nueva puede calificarse');
        }
        if (!actual.fechaUltimaActividad) {
          throw new BadRequestException(
            'Registra un seguimiento antes de calificar la oportunidad',
          );
        }
      }
      if (dto.estado === 'PERDIDA' && !dto.motivoPerdida?.trim()) {
        throw new BadRequestException(
          'El motivo de pérdida es obligatorio al marcar una oportunidad como perdida',
        );
      }

      return tx.oportunidad.update({
        where: { id },
        data: {
          estado: dto.estado,
          probabilidad: PROBABILIDAD_POR_ESTADO[dto.estado],
          motivoPerdida: dto.estado === 'PERDIDA' ? dto.motivoPerdida : null,
          fechaCierre: ESTADOS_CERRADOS.includes(dto.estado) ? new Date() : null,
        },
      });
    });
  }

  async registrarActividad(
    empresaId: string,
    actor: ActorOportunidad,
    oportunidadId: string,
    usuarioId: string,
    dto: RegistrarActividadDto,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const op = await assertExists(
        () => tx.oportunidad.findFirst({ where: { id: oportunidadId, empresaId } }),
        'Oportunidad no encontrada',
        NotFoundException,
      );
      this.asegurarPropia(actor, op.responsableId);

      const actividad = await tx.actividadComercial.create({
        data: {
          oportunidadId,
          usuarioId,
          tipo: dto.tipo,
          resultado: dto.resultado,
          comentarios: dto.comentarios,
          proximaAccion: dto.proximaAccion,
          fechaProximaAccion: dto.fechaProximaAccion ? new Date(dto.fechaProximaAccion) : null,
        },
        include: { usuario: { select: { id: true, nombre: true } } },
      });

      // Denormalización a propósito (ver nota en schema.prisma) — la
      // "tarea" pendiente de la oportunidad es la próxima acción de su
      // actividad más reciente.
      await tx.oportunidad.update({
        where: { id: oportunidadId },
        data: {
          fechaUltimaActividad: actividad.fecha,
          proximaAccion: dto.proximaAccion ?? null,
          fechaProximaAccion: dto.fechaProximaAccion ? new Date(dto.fechaProximaAccion) : null,
        },
      });

      return actividad;
    });
  }

  async vincularProforma(empresaId: string, actor: ActorOportunidad, oportunidadId: string, dto: VincularProformaDto) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const oportunidad = await assertExists(
        () => tx.oportunidad.findFirst({ where: { id: oportunidadId, empresaId } }),
        'Oportunidad no encontrada',
        NotFoundException,
      );
      this.asegurarPropia(actor, oportunidad.responsableId);
      const proforma = await assertExists(
        () => tx.proforma.findFirst({ where: { id: dto.proformaId, empresaId } }),
        'La proforma indicada no existe',
      );
      if (proforma.clienteId !== oportunidad.clienteId) {
        throw new BadRequestException(
          'La proforma pertenece a un cliente distinto al de la oportunidad',
        );
      }

      await tx.proforma.update({ where: { id: dto.proformaId }, data: { oportunidadId } });

      // Vincular una cotización real es evidencia de avance — sube el estado
      // a COTIZADA, pero solo hacia adelante (nunca retrocede un estado más
      // avanzado, ej. si ya estaba en EN_NEGOCIACION).
      if (ORDEN_ESTADOS.indexOf(oportunidad.estado) < ORDEN_ESTADOS.indexOf('COTIZADA')) {
        await tx.oportunidad.update({
          where: { id: oportunidadId },
          data: { estado: 'COTIZADA', probabilidad: PROBABILIDAD_POR_ESTADO.COTIZADA },
        });
      }

      return tx.oportunidad.findFirst({
        where: { id: oportunidadId },
        include: { proformas: { orderBy: { createdAt: 'desc' } } },
      });
    });
  }
}
