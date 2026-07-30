import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehiculoDto } from './dto/create-vehiculo.dto';
import { UpdateVehiculoDto } from './dto/update-vehiculo.dto';
import { CreateMantenimientoDto } from './dto/create-mantenimiento.dto';
import { UpdateMantenimientoDto } from './dto/update-mantenimiento.dto';
import { CreateCombustibleDto } from './dto/create-combustible.dto';
import { assertExists } from '../common/utils/assert-exists.util';

// Replica diasHasta()/estadoVenc() de Flota.jsx real.
const UMBRAL_ALERTA_DIAS = { soat: 60, revTecnica: 60, mantenimiento: 30 };

function diasHasta(fecha: Date | null): number | null {
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const objetivo = new Date(fecha);
  objetivo.setHours(0, 0, 0, 0);
  return Math.ceil((objetivo.getTime() - hoy.getTime()) / 86400000);
}

@Injectable()
export class FlotaService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Vehículos ──────────────────────────────────────────────────

  findAllVehiculos(empresaId: string, incluirInactivos = false) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.vehiculoFlota.findMany({
        where: { empresaId, ...(!incluirInactivos && { activo: true }) },
        orderBy: { nombre: 'asc' },
      }),
    );
  }

  async findOneVehiculo(empresaId: string, id: string) {
    const vehiculo = await this.prisma.withTenant(empresaId, (tx) =>
      tx.vehiculoFlota.findFirst({
        where: { id, empresaId },
        include: {
          mantenimientos: { orderBy: { fecha: 'desc' } },
          registrosCombustible: { orderBy: { fecha: 'desc' } },
        },
      }),
    );
    if (!vehiculo) throw new NotFoundException('Vehículo no encontrado');
    return vehiculo;
  }

  async createVehiculo(empresaId: string, dto: CreateVehiculoDto) {
    if (dto.transportistaId) await this.validarTransportista(empresaId, dto.transportistaId);

    try {
      return await this.prisma.withTenant(empresaId, (tx) =>
        tx.vehiculoFlota.create({
          data: {
            empresaId,
            nombre: dto.nombre,
            tipo: dto.tipo,
            placa: dto.placa.toUpperCase(),
            anio: dto.anio,
            conductor: dto.conductor,
            kmActual: dto.kmActual ?? 0,
            vencSoat: dto.vencSoat ? new Date(dto.vencSoat) : null,
            vencRevTecnica: dto.vencRevTecnica ? new Date(dto.vencRevTecnica) : null,
            proxMantenimiento: dto.proxMantenimiento ? new Date(dto.proxMantenimiento) : null,
            transportistaId: dto.transportistaId,
          },
        }),
      );
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new BadRequestException('Ya existe un vehículo con esa placa en esta empresa');
      }
      throw e;
    }
  }

  async updateVehiculo(empresaId: string, id: string, dto: UpdateVehiculoDto) {
    await this.findOneVehiculo(empresaId, id);
    if (dto.transportistaId) await this.validarTransportista(empresaId, dto.transportistaId);

    try {
      return await this.prisma.withTenant(empresaId, (tx) =>
        tx.vehiculoFlota.update({
          where: { id },
          data: {
            ...(dto.nombre !== undefined && { nombre: dto.nombre }),
            ...(dto.tipo !== undefined && { tipo: dto.tipo }),
            ...(dto.placa !== undefined && { placa: dto.placa.toUpperCase() }),
            ...(dto.anio !== undefined && { anio: dto.anio }),
            ...(dto.conductor !== undefined && { conductor: dto.conductor }),
            ...(dto.kmActual !== undefined && { kmActual: dto.kmActual }),
            ...(dto.vencSoat !== undefined && { vencSoat: new Date(dto.vencSoat) }),
            ...(dto.vencRevTecnica !== undefined && { vencRevTecnica: new Date(dto.vencRevTecnica) }),
            ...(dto.proxMantenimiento !== undefined && {
              proxMantenimiento: new Date(dto.proxMantenimiento),
            }),
            ...(dto.transportistaId !== undefined && { transportistaId: dto.transportistaId }),
            ...(dto.activo !== undefined && { activo: dto.activo }),
          },
        }),
      );
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new BadRequestException('Ya existe un vehículo con esa placa en esta empresa');
      }
      throw e;
    }
  }

  /** Soft-delete: nunca borra la fila — mantenimientos/combustible la referencian por FK. */
  async removeVehiculo(empresaId: string, id: string) {
    await this.findOneVehiculo(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.vehiculoFlota.update({ where: { id }, data: { activo: false } }),
    );
  }

  // ── Mantenimientos ─────────────────────────────────────────────

  findMantenimientos(
    empresaId: string,
    filtros: { vehiculoId?: string; desde?: string; hasta?: string } = {},
  ) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.mantenimientoVehiculo.findMany({
        where: {
          vehiculo: { empresaId },
          ...(filtros.vehiculoId && { vehiculoId: filtros.vehiculoId }),
          ...((filtros.desde || filtros.hasta) && {
            fecha: {
              ...(filtros.desde && { gte: new Date(filtros.desde) }),
              ...(filtros.hasta && { lte: new Date(filtros.hasta) }),
            },
          }),
        },
        include: { vehiculo: { select: { nombre: true, placa: true } } },
        orderBy: { fecha: 'desc' },
      }),
    );
  }

  /** Registra un mantenimiento y sincroniza vehiculo.kmActual si se reporta un km mayor. */
  async registrarMantenimiento(
    empresaId: string,
    vehiculoId: string,
    usuarioId: string | undefined,
    dto: CreateMantenimientoDto,
  ) {
    const vehiculo = await this.findOneVehiculo(empresaId, vehiculoId);

    // Extensión de Fase 7a: el kilometraje no debería retroceder.
    if (dto.kmActual !== undefined && dto.kmActual < Number(vehiculo.kmActual)) {
      throw new BadRequestException(
        `El km reportado (${dto.kmActual}) no puede ser menor al km actual del vehículo (${vehiculo.kmActual})`,
      );
    }

    return this.prisma.withTenant(empresaId, async (tx) => {
      const mantenimiento = await tx.mantenimientoVehiculo.create({
        data: {
          vehiculoId,
          tipo: dto.tipo,
          fecha: dto.fecha ? new Date(dto.fecha) : undefined,
          kmActual: dto.kmActual,
          costo: dto.costo,
          taller: dto.taller,
          observaciones: dto.observaciones,
          usuarioId,
        },
      });

      if (dto.kmActual !== undefined || dto.proximoMantenimiento !== undefined) {
        await tx.vehiculoFlota.update({
          where: { id: vehiculoId },
          data: {
            ...(dto.kmActual !== undefined && { kmActual: dto.kmActual }),
            ...(dto.proximoMantenimiento !== undefined && { proxMantenimiento: new Date(dto.proximoMantenimiento) }),
          },
        });
      }

      return mantenimiento;
    });
  }

  /** Valida que el mantenimiento exista y pertenezca (vía vehículo) a esta empresa. */
  private async findOneMantenimiento(empresaId: string, id: string) {
    const mantenimiento = await this.prisma.withTenant(empresaId, (tx) =>
      tx.mantenimientoVehiculo.findFirst({ where: { id, vehiculo: { empresaId } } }),
    );
    if (!mantenimiento) throw new NotFoundException('Mantenimiento no encontrado');
    return mantenimiento;
  }

  async updateMantenimiento(empresaId: string, id: string, dto: UpdateMantenimientoDto) {
    await this.findOneMantenimiento(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.mantenimientoVehiculo.update({
        where: { id },
        data: {
          ...(dto.tipo !== undefined && { tipo: dto.tipo }),
          ...(dto.fecha !== undefined && { fecha: new Date(dto.fecha) }),
          ...(dto.kmActual !== undefined && { kmActual: dto.kmActual }),
          ...(dto.costo !== undefined && { costo: dto.costo }),
          ...(dto.taller !== undefined && { taller: dto.taller }),
          ...(dto.observaciones !== undefined && { observaciones: dto.observaciones }),
        },
      }),
    );
  }

  async removeMantenimiento(empresaId: string, id: string) {
    await this.findOneMantenimiento(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) => tx.mantenimientoVehiculo.delete({ where: { id } }));
  }

  // ── Combustible ────────────────────────────────────────────────

  findCombustible(
    empresaId: string,
    filtros: { vehiculoId?: string; desde?: string; hasta?: string } = {},
  ) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.registroCombustible.findMany({
        where: {
          vehiculo: { empresaId },
          ...(filtros.vehiculoId && { vehiculoId: filtros.vehiculoId }),
          ...((filtros.desde || filtros.hasta) && {
            fecha: {
              ...(filtros.desde && { gte: new Date(filtros.desde) }),
              ...(filtros.hasta && { lte: new Date(filtros.hasta) }),
            },
          }),
        },
        include: { vehiculo: { select: { nombre: true, placa: true } } },
        orderBy: { fecha: 'desc' },
      }),
    );
  }

  /** Calcula kmRecorridos y sincroniza vehiculo.kmActual con kmDespues. */
  async registrarCombustible(empresaId: string, dto: CreateCombustibleDto) {
    await this.findOneVehiculo(empresaId, dto.vehiculoId);

    if (dto.kmAntes !== undefined && dto.kmDespues !== undefined && dto.kmDespues < dto.kmAntes) {
      throw new BadRequestException('El km al retornar no puede ser menor al km al cargar combustible');
    }
    const kmRecorridos =
      dto.kmAntes !== undefined && dto.kmDespues !== undefined ? dto.kmDespues - dto.kmAntes : 0;

    return this.prisma.withTenant(empresaId, async (tx) => {
      const registro = await tx.registroCombustible.create({
        data: {
          vehiculoId: dto.vehiculoId,
          fecha: dto.fecha ? new Date(dto.fecha) : undefined,
          litros: dto.litros,
          costo: dto.costo,
          kmAntes: dto.kmAntes,
          kmDespues: dto.kmDespues,
          kmRecorridos,
          tipoCombustible: dto.tipoCombustible,
          proveedor: dto.proveedor,
          notas: dto.notas,
        },
      });

      if (dto.kmDespues !== undefined) {
        await tx.vehiculoFlota.update({
          where: { id: dto.vehiculoId },
          data: { kmActual: dto.kmDespues },
        });
      }

      return registro;
    });
  }

  // ── Alertas (calculadas, no persistidas) ────────────────────────

  /** Replica alertas/estadoVenc de Flota.jsx — vencimientos próximos de SOAT/Rev. Técnica/Mantenimiento. */
  async alertas(empresaId: string) {
    const vehiculos = await this.findAllVehiculos(empresaId, false);
    const alertas: Array<{
      vehiculoId: string;
      unidad: string;
      placa: string;
      tipo: string;
      dias: number;
      fecha: Date;
    }> = [];

    for (const v of vehiculos) {
      const dSoat = diasHasta(v.vencSoat);
      const dRevt = diasHasta(v.vencRevTecnica);
      const dMant = diasHasta(v.proxMantenimiento);

      if (dSoat !== null && dSoat <= UMBRAL_ALERTA_DIAS.soat) {
        alertas.push({ vehiculoId: v.id, unidad: v.nombre, placa: v.placa, tipo: 'SOAT', dias: dSoat, fecha: v.vencSoat! });
      }
      if (dRevt !== null && dRevt <= UMBRAL_ALERTA_DIAS.revTecnica) {
        alertas.push({ vehiculoId: v.id, unidad: v.nombre, placa: v.placa, tipo: 'Revisión Técnica', dias: dRevt, fecha: v.vencRevTecnica! });
      }
      if (dMant !== null && dMant <= UMBRAL_ALERTA_DIAS.mantenimiento) {
        alertas.push({ vehiculoId: v.id, unidad: v.nombre, placa: v.placa, tipo: 'Mantenimiento', dias: dMant, fecha: v.proxMantenimiento! });
      }
    }

    return alertas.sort((a, b) => a.dias - b.dias);
  }

  private validarTransportista(empresaId: string, transportistaId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.transportista.findFirst({ where: { id: transportistaId, empresaId } })),
      'El transportista indicado no existe o no pertenece a esta empresa',
    );
  }
}
