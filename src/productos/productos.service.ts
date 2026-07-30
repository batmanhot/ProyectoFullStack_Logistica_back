import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { assertExists } from '../common/utils/assert-exists.util';

@Injectable()
export class ProductosService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(
    empresaId: string,
    filtros: {
      busqueda?: string;
      categoriaId?: string;
      proveedorId?: string;
      incluirInactivos?: boolean;
    } = {},
  ) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.producto.findMany({
        where: {
          empresaId,
          ...(filtros.busqueda && { nombre: { contains: filtros.busqueda, mode: 'insensitive' } }),
          ...(filtros.categoriaId && { categoriaId: filtros.categoriaId }),
          ...(filtros.proveedorId && { proveedorId: filtros.proveedorId }),
          ...(!filtros.incluirInactivos && { estado: 'Activo' }),
        },
        orderBy: { nombre: 'asc' },
      }),
    );
  }

  async findOne(empresaId: string, id: string) {
    const producto = await this.prisma.withTenant(empresaId, (tx) =>
      tx.producto.findFirst({ where: { id, empresaId } }),
    );
    if (!producto) throw new NotFoundException('Producto no encontrado');
    return producto;
  }

  async create(empresaId: string, dto: CreateProductoDto) {
    this.validarRangoStock(dto.stockMinimo, dto.stockMaximo);
    if (dto.categoriaId) await this.validarCategoria(empresaId, dto.categoriaId);
    if (dto.proveedorId) await this.validarProveedor(empresaId, dto.proveedorId);

    try {
      return await this.prisma.withTenant(empresaId, (tx) =>
        tx.producto.create({
          data: {
            empresaId,
            sku: dto.sku,
            nombre: dto.nombre,
            barcode: dto.barcode,
            categoriaId: dto.categoriaId,
            proveedorId: dto.proveedorId,
            unidadMedida: dto.unidadMedida,
            esPerecedero: dto.esPerecedero,
            stockMinimo: dto.stockMinimo,
            stockMaximo: dto.stockMaximo,
            precioCompra: dto.precioCompra,
            precioVenta: dto.precioVenta,
          },
        }),
      );
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new BadRequestException('Ya existe un producto con ese SKU en esta empresa');
      }
      throw e;
    }
  }

  async update(empresaId: string, id: string, dto: UpdateProductoDto) {
    const actual = await this.findOne(empresaId, id);

    const stockMinimo = dto.stockMinimo ?? (actual.stockMinimo ? Number(actual.stockMinimo) : undefined);
    const stockMaximo = dto.stockMaximo ?? (actual.stockMaximo ? Number(actual.stockMaximo) : undefined);
    this.validarRangoStock(stockMinimo, stockMaximo);

    if (dto.categoriaId) await this.validarCategoria(empresaId, dto.categoriaId);
    if (dto.proveedorId) await this.validarProveedor(empresaId, dto.proveedorId);

    try {
      return await this.prisma.withTenant(empresaId, (tx) =>
        tx.producto.update({
          where: { id },
          data: {
            ...(dto.nombre !== undefined && { nombre: dto.nombre }),
            ...(dto.barcode !== undefined && { barcode: dto.barcode }),
            ...(dto.categoriaId !== undefined && { categoriaId: dto.categoriaId }),
            ...(dto.proveedorId !== undefined && { proveedorId: dto.proveedorId }),
            ...(dto.unidadMedida !== undefined && { unidadMedida: dto.unidadMedida }),
            ...(dto.esPerecedero !== undefined && { esPerecedero: dto.esPerecedero }),
            ...(dto.stockMinimo !== undefined && { stockMinimo: dto.stockMinimo }),
            ...(dto.stockMaximo !== undefined && { stockMaximo: dto.stockMaximo }),
            ...(dto.precioCompra !== undefined && { precioCompra: dto.precioCompra }),
            ...(dto.precioVenta !== undefined && { precioVenta: dto.precioVenta }),
            ...(dto.estado !== undefined && { estado: dto.estado }),
          },
        }),
      );
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new BadRequestException('Ya existe un producto con ese SKU en esta empresa');
      }
      throw e;
    }
  }

  /** Soft-delete: nunca borra la fila — Movimientos/Inventario/Lotes la referencian por FK. */
  async remove(empresaId: string, id: string) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.producto.update({ where: { id }, data: { estado: 'Inactivo' } }),
    );
  }

  private validarRangoStock(stockMinimo?: number, stockMaximo?: number) {
    if (stockMinimo != null && stockMaximo != null && stockMinimo > stockMaximo) {
      throw new BadRequestException('El stock mínimo no puede ser mayor al stock máximo');
    }
  }

  private validarCategoria(empresaId: string, categoriaId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.categoria.findFirst({ where: { id: categoriaId, empresaId } })),
      'La categoría indicada no existe o no pertenece a esta empresa',
    );
  }

  private validarProveedor(empresaId: string, proveedorId: string) {
    return assertExists(
      () => this.prisma.withTenant(empresaId, (tx) => tx.proveedor.findFirst({ where: { id: proveedorId, empresaId } })),
      'El proveedor indicado no existe o no pertenece a esta empresa',
    );
  }
}
