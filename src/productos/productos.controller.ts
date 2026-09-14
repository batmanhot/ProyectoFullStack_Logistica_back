import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { SoloRoles } from '../common/decorators/solo-roles.decorator';
import { ProductosService } from './productos.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';

@Controller('productos')
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  // Lectura abierta — mismo criterio que Almacenes/Categorías/Proyectos/
  // Proveedores/Clientes/Transportistas (Hallazgo Alto #7, auditoría
  // 2026-07-29). Bug real 2026-09-12: Despachos.jsx usa /productos tanto
  // para armar un pedido nuevo como para mostrar el NOMBRE del producto en
  // el detalle de despachos ya existentes (prodMap) — Despachador y Chofer
  // tienen 'despachos' pero no 'inventario', así que con @Permiso a nivel
  // de clase se quedaban sin nombres de producto (403 silencioso → lista
  // vacía) al abrir un despacho, no solo al crear uno.
  @Get()
  findAll(
    @TenantId() empresaId: string,
    @Query('busqueda') busqueda?: string,
    @Query('categoriaId') categoriaId?: string,
    @Query('proveedorId') proveedorId?: string,
    @Query('incluirInactivos') incluirInactivos?: string,
  ) {
    return this.productosService.findAll(empresaId, {
      busqueda,
      categoriaId,
      proveedorId,
      incluirInactivos: incluirInactivos === 'true',
    });
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.productosService.findOne(empresaId, id);
  }

  @Permiso('inventario')
  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateProductoDto) {
    return this.productosService.create(empresaId, dto);
  }

  @Permiso('inventario')
  @Put(':id')
  update(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductoDto,
  ) {
    return this.productosService.update(empresaId, id, dto);
  }

  @Permiso('inventario')
  @SoloRoles('gerente-operaciones')
  @Delete(':id')
  remove(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.productosService.remove(empresaId, id);
  }
}
