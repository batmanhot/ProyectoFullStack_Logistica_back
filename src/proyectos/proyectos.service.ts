import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertExists } from '../common/utils/assert-exists.util';
import { CreateProyectoDto } from './dto/create-proyecto.dto';
import { UpdateProyectoDto } from './dto/update-proyecto.dto';

const SELECT_PUBLICO = {
  id: true,
  codigo: true,
  nombre: true,
  estado: true,
  fechaInicio: true,
  fechaFin: true,
  activo: true,
  createdAt: true,
  cliente: { select: { id: true, razonSocial: true } },
  cdr: { select: { id: true, codigo: true, nombre: true } },
} as const;

@Injectable()
export class ProyectosService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, filtros: { incluirInactivos?: boolean; estado?: string; clienteId?: string } = {}) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.proyecto.findMany({
        where: {
          empresaId,
          ...(!filtros.incluirInactivos && { activo: true }),
          ...(filtros.estado && { estado: filtros.estado as any }),
          ...(filtros.clienteId && { clienteId: filtros.clienteId }),
        },
        select: SELECT_PUBLICO,
        orderBy: { nombre: 'asc' },
      }),
    );
  }

  async findOne(empresaId: string, id: string) {
    const proyecto = await this.prisma.withTenant(empresaId, (tx) =>
      tx.proyecto.findFirst({ where: { id, empresaId }, select: SELECT_PUBLICO }),
    );
    if (!proyecto) throw new NotFoundException('Proyecto no encontrado');
    return proyecto;
  }

  async create(empresaId: string, dto: CreateProyectoDto) {
    if (dto.clienteId) await this.validarCliente(empresaId, dto.clienteId);
    if (dto.cdrId) await this.validarCdr(empresaId, dto.cdrId);

    try {
      return await this.prisma.withTenant(empresaId, (tx) =>
        tx.proyecto.create({
          data: {
            empresaId,
            codigo: dto.codigo,
            nombre: dto.nombre,
            clienteId: dto.clienteId,
            cdrId: dto.cdrId,
            estado: dto.estado,
            fechaInicio: dto.fechaInicio ? new Date(dto.fechaInicio) : undefined,
            fechaFin: dto.fechaFin ? new Date(dto.fechaFin) : undefined,
          },
          select: SELECT_PUBLICO,
        }),
      );
    } catch (e: any) {
      if (e.code === 'P2002') throw new BadRequestException('Ya existe un proyecto con ese código en esta empresa');
      throw e;
    }
  }

  async update(empresaId: string, id: string, dto: UpdateProyectoDto) {
    await this.findOne(empresaId, id);
    if (dto.clienteId) await this.validarCliente(empresaId, dto.clienteId);
    if (dto.cdrId) await this.validarCdr(empresaId, dto.cdrId);

    try {
      return await this.prisma.withTenant(empresaId, (tx) =>
        tx.proyecto.update({
          where: { id },
          data: {
            ...(dto.codigo !== undefined && { codigo: dto.codigo }),
            ...(dto.nombre !== undefined && { nombre: dto.nombre }),
            ...(dto.clienteId !== undefined && { clienteId: dto.clienteId }),
            ...(dto.cdrId !== undefined && { cdrId: dto.cdrId }),
            ...(dto.estado !== undefined && { estado: dto.estado }),
            ...(dto.fechaInicio !== undefined && { fechaInicio: dto.fechaInicio ? new Date(dto.fechaInicio) : null }),
            ...(dto.fechaFin !== undefined && { fechaFin: dto.fechaFin ? new Date(dto.fechaFin) : null }),
            ...(dto.activo !== undefined && { activo: dto.activo }),
          },
          select: SELECT_PUBLICO,
        }),
      );
    } catch (e: any) {
      if (e.code === 'P2002') throw new BadRequestException('Ya existe un proyecto con ese código en esta empresa');
      throw e;
    }
  }

  /** Soft-delete: nunca borra la fila — PedidoInterno/Movimiento la referencian por FK (SET NULL). */
  async remove(empresaId: string, id: string) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.proyecto.update({ where: { id }, data: { activo: false }, select: SELECT_PUBLICO }),
    );
  }

  private validarCliente(empresaId: string, clienteId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.cliente.findFirst({ where: { id: clienteId, empresaId } })),
      'El cliente indicado no existe o no pertenece a esta empresa',
    );
  }

  private validarCdr(empresaId: string, cdrId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.cDR.findFirst({ where: { id: cdrId, empresaId } })),
      'El CDR indicado no existe o no pertenece a esta empresa',
    );
  }

  /**
   * Reporte de consumo por proyecto (Fase 4, 2026-09-04) — universo: toda
   * SALIDA real que vino de un Pedido Interno (`pedidoInternoId` no nulo).
   * Sin agregar en el backend a propósito: devuelve filas planas ya
   * valorizadas (cantidad × costoUnitario del Movimiento, el costo real al
   * momento de la salida, no el actual) y el frontend arma las vistas
   * (por semana/mes/comparativo/CDR/área) — mismo patrón que
   * Reportes.jsx/ContabilidadReportes.jsx ya usan en este proyecto.
   * `proyectoId: null` en una fila = "Sin proyecto asignado" en el reporte.
   */
  async reporteConsumo(
    empresaId: string,
    filtros: { desde?: string; hasta?: string; proyectoId?: string; cdrId?: string; areaId?: string; clienteId?: string },
  ) {
    // `desde`/`hasta` arman UN solo filtro de rango sobre `fecha` — dos
    // spreads separados con la misma clave se pisarían entre sí (el segundo
    // ganaría siempre), perdiendo en silencio el límite inferior.
    // `hasta` llega como "YYYY-MM-DD" (input type=date) — sin forzar hora,
    // `new Date(...)` lo interpreta como medianoche UTC, así que cualquier
    // movimiento de ESE MISMO día generado después (todo el día en horarios
    // UTC-negativos como Perú) quedaba excluido en silencio. Mismo criterio
    // que ya usan incidencias.service.ts / auditoria.service.ts.
    const fechaFiltro: { gte?: Date; lte?: Date } = {};
    if (filtros.desde) fechaFiltro.gte = new Date(filtros.desde);
    if (filtros.hasta) fechaFiltro.lte = new Date(`${filtros.hasta}T23:59:59.999Z`);

    return this.prisma.withTenant(empresaId, (tx) =>
      tx.movimiento.findMany({
        where: {
          empresaId,
          tipo: 'SALIDA',
          pedidoInternoId: { not: null },
          ...(Object.keys(fechaFiltro).length > 0 && { fecha: fechaFiltro }),
          ...(filtros.proyectoId && { proyectoId: filtros.proyectoId }),
          ...(filtros.cdrId && { proyecto: { cdrId: filtros.cdrId } }),
          ...(filtros.clienteId && { proyecto: { clienteId: filtros.clienteId } }),
          ...(filtros.areaId && { pedidoInterno: { areaId: filtros.areaId } }),
        },
        select: {
          id: true,
          fecha: true,
          cantidad: true,
          costoUnitario: true,
          producto: { select: { sku: true, nombre: true, unidadMedida: true } },
          proyecto: {
            select: {
              id: true, codigo: true, nombre: true,
              cdr: { select: { id: true, codigo: true, nombre: true } },
              cliente: { select: { id: true, razonSocial: true } },
            },
          },
          pedidoInterno: {
            select: { numero: true, area: { select: { id: true, nombre: true, codigo: true } } },
          },
        },
        orderBy: { fecha: 'desc' },
        take: 5000,
      }),
    );
  }

  /**
   * Pedidos con proyecto asignado que todavía no llegaron a ENTREGADO —
   * "pendientes por despachar" del reporte (requerimiento explícito del
   * cliente, punto 2). Reusa el mismo criterio de PedidosInternosService,
   * pero acotado a los que tienen proyecto (los que no, no son del dominio
   * de este reporte).
   */
  async pendientesPorDespachar(empresaId: string, filtros: { proyectoId?: string; cdrId?: string; areaId?: string }) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.pedidoInterno.findMany({
        where: {
          empresaId,
          proyectoId: { not: null },
          estado: { notIn: ['ENTREGADO', 'RECHAZADO'] },
          ...(filtros.proyectoId && { proyectoId: filtros.proyectoId }),
          ...(filtros.cdrId && { proyecto: { cdrId: filtros.cdrId } }),
          ...(filtros.areaId && { areaId: filtros.areaId }),
        },
        select: {
          id: true, numero: true, estado: true, fecha: true, fechaRequerida: true,
          area: { select: { id: true, nombre: true, codigo: true } },
          proyecto: { select: { id: true, codigo: true, nombre: true, cdr: { select: { nombre: true } } } },
          items: { select: { cantidad: true } },
        },
        orderBy: { fecha: 'asc' },
        take: 500,
      }),
    );
  }
}
