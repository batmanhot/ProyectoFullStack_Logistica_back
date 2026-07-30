import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { ListasPreciosService } from './listas-precios.service';
import { CreateListaPreciosDto } from './dto/create-lista-precios.dto';
import { UpdateListaPreciosDto } from './dto/update-lista-precios.dto';

@Permiso('lista-precios')
@Controller('listas-precios')
export class ListasPreciosController {
  constructor(private readonly service: ListasPreciosService) {}

  @Get()
  findAll(@TenantId() empresaId: string) {
    return this.service.findAll(empresaId);
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.service.findOne(empresaId, id);
  }

  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateListaPreciosDto) {
    return this.service.create(empresaId, dto);
  }

  @Put(':id')
  update(@TenantId() empresaId: string, @Param('id') id: string, @Body() dto: UpdateListaPreciosDto) {
    return this.service.update(empresaId, id, dto);
  }

  @Delete(':id')
  remove(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.service.remove(empresaId, id);
  }

  @Patch(':id/precio/:productoId')
  setPrecio(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Param('productoId') productoId: string,
    @Body() body: { precio: number | null },
  ) {
    return this.service.setPrecioProducto(empresaId, id, productoId, body.precio);
  }

  @Post(':id/duplicar')
  duplicar(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.service.duplicar(empresaId, id);
  }
}
