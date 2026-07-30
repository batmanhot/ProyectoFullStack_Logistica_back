import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUbicacionDto } from './dto/create-ubicacion.dto';
import { UpdateUbicacionDto } from './dto/update-ubicacion.dto';
import { ReubicarDto } from './dto/reubicar.dto';
import { assertExists } from '../common/utils/assert-exists.util';

@Injectable()
export class UbicacionesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ubicacion no tiene empresaId propio — se escopa vía almacenId -> Almacen.empresaId.
   * El filtro relacional de Prisma (almacen: { empresaId }) ya aísla por tenant;
   * la política RLS (ver prisma/sql/enable_rls_fase2.sql) lo refuerza por debajo.
   */
  findAll(empresaId: string, almacenId?: string, incluirInactivas = false) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.ubicacion.findMany({
        where: {
          almacen: { empresaId },
          ...(almacenId && { almacenId }),
          ...(!incluirInactivas && { estado: { not: 'Inactiva' } }),
        },
        orderBy: { codigo: 'asc' },
      }),
    );
  }

  async findOne(empresaId: string, id: string) {
    const ubicacion = await this.prisma.withTenant(empresaId, (tx) =>
      tx.ubicacion.findFirst({ where: { id, almacen: { empresaId } } }),
    );
    if (!ubicacion) throw new NotFoundException('Ubicación no encontrada');
    return ubicacion;
  }

  async create(empresaId: string, dto: CreateUbicacionDto) {
    await this.validarAlmacen(empresaId, dto.almacenId);

    try {
      return await this.prisma.withTenant(empresaId, (tx) =>
        tx.ubicacion.create({
          data: {
            almacenId: dto.almacenId,
            codigo: dto.codigo,
            tipo: dto.tipo,
            zona: dto.zona,
            capacidadMax: dto.capacidadMax,
            observaciones: dto.observaciones,
          },
        }),
      );
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new BadRequestException('Ya existe una ubicación con ese código en este almacén');
      }
      throw e;
    }
  }

  async update(empresaId: string, id: string, dto: UpdateUbicacionDto) {
    const actual = await this.findOne(empresaId, id);

    // Extensión por analogía con la regla stockMinimo<=stockMaximo (sección 5):
    // capacidadActual nunca puede superar capacidadMax.
    const nuevoMax = dto.capacidadMax ?? actual.capacidadMax;
    const nuevoActual = dto.capacidadActual ?? actual.capacidadActual;
    if (nuevoActual > nuevoMax) {
      throw new BadRequestException('La capacidad actual no puede superar la capacidad máxima');
    }

    try {
      return await this.prisma.withTenant(empresaId, (tx) =>
        tx.ubicacion.update({
          where: { id },
          data: {
            ...(dto.codigo !== undefined && { codigo: dto.codigo }),
            ...(dto.tipo !== undefined && { tipo: dto.tipo }),
            ...(dto.zona !== undefined && { zona: dto.zona }),
            ...(dto.capacidadMax !== undefined && { capacidadMax: dto.capacidadMax }),
            ...(dto.capacidadActual !== undefined && { capacidadActual: dto.capacidadActual }),
            ...(dto.estado !== undefined && { estado: dto.estado }),
            ...(dto.observaciones !== undefined && { observaciones: dto.observaciones }),
          },
        }),
      );
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new BadRequestException('Ya existe una ubicación con ese código en este almacén');
      }
      throw e;
    }
  }

  /** Soft-delete: nunca borra la fila — Inventario (Fase 3) la referencia por FK. */
  async remove(empresaId: string, id: string) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.ubicacion.update({ where: { id }, data: { estado: 'Inactiva' } }),
    );
  }

  /** Qué productos hay físicamente en esta ubicación (para el Mapa de Almacén — Fase 7b). */
  async inventarioDeUbicacion(empresaId: string, ubicacionId: string) {
    await this.findOne(empresaId, ubicacionId);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.inventario.findMany({
        where: { ubicacionId, cantidad: { gt: 0 } },
        include: { producto: { select: { sku: true, nombre: true, unidadMedida: true } } },
        orderBy: { producto: { nombre: 'asc' } },
      }),
    );
  }

  /**
   * Mapa de Almacén (Fase 7b) — mueve cantidad del "bucket" sin ubicación
   * asignada (ubicacionId=null) de ese almacén hacia esta ubicación
   * específica. NO genera un Movimiento real: el stock nunca sale del
   * almacén, solo se reorganiza físicamente dentro de él.
   *
   * Solo puede reubicarse la porción DISPONIBLE (cantidad - cantidadReservada)
   * del bucket sin asignar — mover stock ya reservado para un Despacho
   * pendiente rompería el invariante que valida disponibilidad en
   * DespachosService (que siempre opera contra el bucket ubicacionId=null).
   */
  async asignar(empresaId: string, ubicacionId: string, dto: ReubicarDto) {
    const ubicacion = await this.findOne(empresaId, ubicacionId);
    await this.validarProducto(empresaId, dto.productoId);

    return this.prisma.withTenant(empresaId, async (tx) => {
      const bucketSinAsignar = await tx.inventario.findFirst({
        where: { productoId: dto.productoId, almacenId: ubicacion.almacenId, ubicacionId: null },
      });
      const disponible = bucketSinAsignar
        ? Number(bucketSinAsignar.cantidad) - Number(bucketSinAsignar.cantidadReservada)
        : 0;

      if (dto.cantidad > disponible) {
        throw new BadRequestException(
          `Solo hay ${disponible} unidad(es) disponibles sin reservar para reubicar (el resto ya está comprometido con despachos pendientes)`,
        );
      }

      await tx.inventario.update({
        where: { id: bucketSinAsignar!.id },
        data: { cantidad: { decrement: dto.cantidad } },
      });

      await this.incrementarOCrear(tx, dto.productoId, ubicacion.almacenId, ubicacionId, dto.cantidad);
      await this.recalcularCapacidadActual(tx, ubicacionId);

      return { ok: true, productoId: dto.productoId, ubicacionId, cantidadReubicada: dto.cantidad };
    });
  }

  /** Inverso de asignar() — regresa cantidad de esta ubicación al bucket general del almacén. */
  async liberar(empresaId: string, ubicacionId: string, dto: ReubicarDto) {
    const ubicacion = await this.findOne(empresaId, ubicacionId);
    await this.validarProducto(empresaId, dto.productoId);

    return this.prisma.withTenant(empresaId, async (tx) => {
      const bucketUbicacion = await tx.inventario.findFirst({
        where: { productoId: dto.productoId, almacenId: ubicacion.almacenId, ubicacionId },
      });
      const disponibleAqui = bucketUbicacion ? Number(bucketUbicacion.cantidad) : 0;

      if (dto.cantidad > disponibleAqui) {
        throw new BadRequestException(
          `Esta ubicación solo tiene ${disponibleAqui} unidad(es) de este producto`,
        );
      }

      await tx.inventario.update({
        where: { id: bucketUbicacion!.id },
        data: { cantidad: { decrement: dto.cantidad } },
      });

      await this.incrementarOCrear(tx, dto.productoId, ubicacion.almacenId, null, dto.cantidad);
      await this.recalcularCapacidadActual(tx, ubicacionId);

      return { ok: true, productoId: dto.productoId, ubicacionId, cantidadLiberada: dto.cantidad };
    });
  }

  /** Mismo patrón sin upsert() — null/no-null en ubicacionId no admite el selector compuesto. */
  private async incrementarOCrear(
    tx: PrismaClient,
    productoId: string,
    almacenId: string,
    ubicacionId: string | null,
    delta: number,
  ) {
    const existente = await tx.inventario.findFirst({ where: { productoId, almacenId, ubicacionId } });
    if (existente) {
      return tx.inventario.update({ where: { id: existente.id }, data: { cantidad: { increment: delta } } });
    }
    return tx.inventario.create({ data: { productoId, almacenId, ubicacionId, cantidad: delta } });
  }

  /** capacidadActual = cantidad de SKUs distintos con stock en esta ubicación. */
  private async recalcularCapacidadActual(tx: PrismaClient, ubicacionId: string) {
    const lineas = await tx.inventario.count({ where: { ubicacionId, cantidad: { gt: 0 } } });
    await tx.ubicacion.update({ where: { id: ubicacionId }, data: { capacidadActual: lineas } });
  }

  private validarAlmacen(empresaId: string, almacenId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.almacen.findFirst({ where: { id: almacenId, empresaId } })),
      'El almacén indicado no existe o no pertenece a esta empresa',
    );
  }

  private validarProducto(empresaId: string, productoId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.producto.findFirst({ where: { id: productoId, empresaId } })),
      'El producto indicado no existe o no pertenece a esta empresa',
    );
  }
}
