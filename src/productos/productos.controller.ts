import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { ProductosService } from './productos.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';

@Permiso('inventario')
@Controller('productos')
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

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

  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateProductoDto) {
    return this.productosService.create(empresaId, dto);
  }

  @Put(':id')
  update(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductoDto,
  ) {
    return this.productosService.update(empresaId, id, dto);
  }

  @Delete(':id')
  remove(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.productosService.remove(empresaId, id);
  }
}
