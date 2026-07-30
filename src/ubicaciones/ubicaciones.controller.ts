import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { UbicacionesService } from './ubicaciones.service';
import { CreateUbicacionDto } from './dto/create-ubicacion.dto';
import { UpdateUbicacionDto } from './dto/update-ubicacion.dto';
import { ReubicarDto } from './dto/reubicar.dto';

@Permiso('mapa-almacen')
@Controller('ubicaciones')
export class UbicacionesController {
  constructor(private readonly ubicacionesService: UbicacionesService) {}

  @Get()
  findAll(
    @TenantId() empresaId: string,
    @Query('almacenId') almacenId?: string,
    @Query('incluirInactivas') incluirInactivas?: string,
  ) {
    return this.ubicacionesService.findAll(empresaId, almacenId, incluirInactivas === 'true');
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.ubicacionesService.findOne(empresaId, id);
  }

  /** Qué hay físicamente en esta ubicación — para el Mapa de Almacén. */
  @Get(':id/inventario')
  inventarioDeUbicacion(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.ubicacionesService.inventarioDeUbicacion(empresaId, id);
  }

  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateUbicacionDto) {
    return this.ubicacionesService.create(empresaId, dto);
  }

  @Put(':id')
  update(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUbicacionDto,
  ) {
    return this.ubicacionesService.update(empresaId, id, dto);
  }

  /** Mueve cantidad del bucket sin asignar del almacén hacia esta ubicación. Sin Movimiento real. */
  @Post(':id/asignar')
  asignar(@TenantId() empresaId: string, @Param('id') id: string, @Body() dto: ReubicarDto) {
    return this.ubicacionesService.asignar(empresaId, id, dto);
  }

  /** Inverso de asignar — regresa cantidad de esta ubicación al bucket general del almacén. */
  @Post(':id/liberar')
  liberar(@TenantId() empresaId: string, @Param('id') id: string, @Body() dto: ReubicarDto) {
    return this.ubicacionesService.liberar(empresaId, id, dto);
  }

  @Delete(':id')
  remove(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.ubicacionesService.remove(empresaId, id);
  }
}
