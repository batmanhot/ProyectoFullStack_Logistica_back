import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { AlmacenesService } from './almacenes.service';
import { CreateAlmacenDto } from './dto/create-almacen.dto';
import { UpdateAlmacenDto } from './dto/update-almacen.dto';

@Controller('almacenes')
export class AlmacenesController {
  constructor(private readonly almacenesService: AlmacenesService) {}

  @Get()
  findAll(
    @TenantId() empresaId: string,
    @Query('busqueda') busqueda?: string,
    @Query('incluirInactivos') incluirInactivos?: string,
  ) {
    return this.almacenesService.findAll(empresaId, busqueda, incluirInactivos === 'true');
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.almacenesService.findOne(empresaId, id);
  }

  // Hallazgo Alto #7 (auditoría 2026-07-29): la lectura queda abierta (se
  // consulta desde muchas pantallas, para cualquier rol autenticado — mismo
  // patrón que el resto de catálogos), pero crear/editar/borrar un almacén
  // completo requiere permiso explícito.
  @Permiso('almacenes')
  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateAlmacenDto) {
    return this.almacenesService.create(empresaId, dto);
  }

  @Permiso('almacenes')
  @Put(':id')
  update(@TenantId() empresaId: string, @Param('id') id: string, @Body() dto: UpdateAlmacenDto) {
    return this.almacenesService.update(empresaId, id, dto);
  }

  @Permiso('almacenes')
  @Delete(':id')
  remove(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.almacenesService.remove(empresaId, id);
  }
}
