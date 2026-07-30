import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { CotizacionesService } from './cotizaciones.service';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';
import { UpdateCotizacionDto } from './dto/update-cotizacion.dto';
import { CreateRespuestaDto } from './dto/create-respuesta.dto';

@Permiso('cotizaciones')
@Controller('cotizaciones')
export class CotizacionesController {
  constructor(private readonly cotizacionesService: CotizacionesService) {}

  @Get()
  findAll(@TenantId() empresaId: string, @Query('estado') estado?: string) {
    return this.cotizacionesService.findAll(empresaId, estado);
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.cotizacionesService.findOne(empresaId, id);
  }

  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateCotizacionDto) {
    return this.cotizacionesService.create(empresaId, dto);
  }

  @Put(':id')
  update(@TenantId() empresaId: string, @Param('id') id: string, @Body() dto: UpdateCotizacionDto) {
    return this.cotizacionesService.update(empresaId, id, dto);
  }

  @Delete(':id')
  remove(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.cotizacionesService.remove(empresaId, id);
  }

  @Post(':id/respuestas')
  agregarRespuesta(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: CreateRespuestaDto,
  ) {
    return this.cotizacionesService.agregarRespuesta(empresaId, id, dto);
  }

  @Put(':id/respuestas/:respuestaId/ganadora')
  marcarGanadora(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Param('respuestaId') respuestaId: string,
  ) {
    return this.cotizacionesService.marcarGanadora(empresaId, id, respuestaId);
  }
}
