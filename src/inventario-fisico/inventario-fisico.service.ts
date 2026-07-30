import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoInventarioFisico, TipoMovimiento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MovimientosService } from '../movimientos/movimientos.service';
import { CreateInventarioFisicoDto } from './dto/create-inventario-fisico.dto';
import { ActualizarLineaDto } from './dto/actualizar-linea.dto';
import { validarEnum } from '../common/utils/validar-enum.util';
import { assertExists } from '../common/utils/assert-exists.util';

interface LineaSnapshot {
  productoId: string;
  stockSistema: number;
  costoUnitario: number;
}

@Injectable()
export class InventarioFisicoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movimientosService: MovimientosService,
  ) {}

  findAll(empresaId: string, filtros: { almacenId?: string; estado?: string } = {}) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.inventarioFisico.findMany({
        where: {
          empresaId,
          ...(filtros.almacenId && { almacenId: filtros.almacenId }),
          ...(filtros.estado && { estado: validarEnum(filtros.estado, Object.values(EstadoInventarioFisico)) }),
        },
        include: { almacen: { select: { nombre: true } }, _count: { select: { lineas: true } } },
        orderBy: { fecha: 'desc' },
        take: 500,
      }),
    );
  }

  async findOne(empresaId: string, id: string) {
    const inventario = await this.prisma.withTenant(empresaId, (tx) =>
      tx.inventarioFisico.findFirst({
        where: { id, empresaId },
        include: { lineas: { include: { producto: { select: { sku: true, nombre: true, unidadMedida: true } } } } },
      }),
    );
    if (!inventario) throw new NotFoundException('Inventario físico no encontrado');
    return inventario;
  }

  /**
   * Genera el snapshot de líneas desde el stock ACTUAL del almacén indicado
   * (Inventario.cantidad — no Producto.stockActual total, decisión de Fase 6).
   * Incluye productos sin fila de Inventario todavía (stockSistema = 0) —
   * un conteo físico puede encontrar sobrantes de algo que el sistema no
   * sabía que existía ahí.
   */
  async create(empresaId: string, usuarioId: string, dto: CreateInventarioFisicoDto) {
    await this.validarAlmacen(empresaId, dto.almacenId);
    if (dto.categoriaId) await this.validarCategoria(empresaId, dto.categoriaId);

    return this.prisma.withTenant(empresaId, async (tx) => {
      const productos = await tx.producto.findMany({
        where: {
          empresaId,
          estado: 'Activo',
          ...(dto.categoriaId && { categoriaId: dto.categoriaId }),
        },
      });

      const lineas: LineaSnapshot[] = [];
      for (const producto of productos) {
        const inv = await tx.inventario.findFirst({
          where: { productoId: producto.id, almacenId: dto.almacenId, ubicacionId: null },
        });
        lineas.push({
          productoId: producto.id,
          stockSistema: inv ? Number(inv.cantidad) : 0,
          costoUnitario: producto.precioCompra ? Number(producto.precioCompra) : 0,
        });
      }

      const cantidadPrevia = await tx.inventarioFisico.count({ where: { empresaId } });
      const numero = `INV-${String(cantidadPrevia + 1).padStart(5, '0')}`;

      return tx.inventarioFisico.create({
        data: {
          empresaId,
          numero,
          almacenId: dto.almacenId,
          categoriaId: dto.categoriaId,
          usuarioId,
          notas: dto.notas,
          lineas: { create: lineas },
        },
        include: { lineas: true },
      });
    });
  }

  /** Actualiza el conteo físico de UNA línea — recalcula diferencia. */
  async actualizarLinea(
    empresaId: string,
    inventarioId: string,
    productoId: string,
    dto: ActualizarLineaDto,
  ) {
    const inventario = await this.findOne(empresaId, inventarioId);
    if (inventario.estado !== 'EN_CURSO') {
      throw new ForbiddenException('No se puede modificar un inventario ya CERRADO');
    }
    const linea = inventario.lineas.find((l) => l.productoId === productoId);
    if (!linea) throw new NotFoundException('Ese producto no forma parte de este inventario físico');

    const diferencia = dto.stockFisico - Number(linea.stockSistema);

    return this.prisma.withTenant(empresaId, (tx) =>
      tx.inventarioFisicoLinea.update({
        where: { id: linea.id },
        data: { stockFisico: dto.stockFisico, diferencia },
      }),
    );
  }

  /**
   * Cierra el conteo — por cada línea con diferencia≠0 (y sin ajustar aún),
   * genera un Movimiento AJUSTE REAL vía el motor de Fase 3, reutilizando
   * `direccion` según el signo. El código real (InventarioFisico.jsx) ya
   * hacía exactamente esto (registrarMovimiento tipo AJUSTE) — aquí se
   * integra con el motor unificado en vez de duplicar la lógica.
   */
  async cerrar(empresaId: string, id: string) {
    const inventario = await this.findOne(empresaId, id);
    if (inventario.estado !== 'EN_CURSO') {
      throw new BadRequestException('Este inventario ya está CERRADO');
    }

    const pendientesDeContar = inventario.lineas.filter((l) => l.stockFisico === null);
    if (pendientesDeContar.length > 0) {
      throw new BadRequestException(
        `Quedan ${pendientesDeContar.length} producto(s) sin contar antes de poder cerrar`,
      );
    }

    return this.prisma.withTenant(empresaId, async (tx) => {
      for (const linea of inventario.lineas) {
        const diferencia = Number(linea.diferencia);
        if (diferencia === 0 || linea.ajustado) continue;

        await this.movimientosService.crearEnTransaccion(tx, empresaId, {
          tipo: TipoMovimiento.AJUSTE,
          productoId: linea.productoId,
          almacenId: inventario.almacenId,
          cantidad: Math.abs(diferencia),
          direccion: diferencia > 0 ? 'incremento' : 'decremento',
          costoUnitario: Number(linea.costoUnitario),
          motivo: diferencia > 0 ? 'Sobrante en inventario físico' : 'Faltante en inventario físico',
          documento: inventario.numero,
        } as any);

        await tx.inventarioFisicoLinea.update({
          where: { id: linea.id },
          data: { ajustado: true },
        });
      }

      return tx.inventarioFisico.update({
        where: { id },
        data: { estado: 'CERRADO', fechaCierre: new Date() },
        include: { lineas: true },
      });
    });
  }

  private validarAlmacen(empresaId: string, almacenId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.almacen.findFirst({ where: { id: almacenId, empresaId } })),
      'El almacén indicado no existe o no pertenece a esta empresa',
    );
  }

  private validarCategoria(empresaId: string, categoriaId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.categoria.findFirst({ where: { id: categoriaId, empresaId } })),
      'La categoría indicada no existe o no pertenece a esta empresa',
    );
  }
}
