import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { CotizacionesService } from './cotizaciones.service';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';
import { UpdateCotizacionDto } from './dto/update-cotizacion.dto';
import { CreateRespuestaDto } from './dto/create-respuesta.dto';

@Controller('cotizaciones')
export class CotizacionesController {
  constructor(private readonly cotizacionesService: CotizacionesService) {}

  // Lectura abierta — mismo criterio que Ordenes de Compra/Lotes (ver
  // comentario ahí). Encontrado 2026-09-12: Alertas.jsx YA daba por hecho
  // que Gerente de Operaciones ve alertas de "RFQ sin respuesta"
  // (esRolConCotizaciones incluye 'gerente-operaciones' desde antes de esta
  // sesión), pero el Alcance de roles 2026-09-11 le quitó 'cotizaciones' al
  // narrar su catálogo — quedó en 403 silencioso. Analista de Compras sigue
  // siendo el único que puede crear/gestionar cotizaciones de verdad.
  @Get()
  findAll(@TenantId() empresaId: string, @Query('estado') estado?: string) {
    return this.cotizacionesService.findAll(empresaId, estado);
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.cotizacionesService.findOne(empresaId, id);
  }

  @Permiso('cotizaciones')
  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateCotizacionDto) {
    return this.cotizacionesService.create(empresaId, dto);
  }

  @Permiso('cotizaciones')
  @Put(':id')
  update(@TenantId() empresaId: string, @Param('id') id: string, @Body() dto: UpdateCotizacionDto) {
    return this.cotizacionesService.update(empresaId, id, dto);
  }

  @Permiso('cotizaciones')
  @Delete(':id')
  remove(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.cotizacionesService.remove(empresaId, id);
  }

  @Permiso('cotizaciones')
  @Post(':id/respuestas')
  agregarRespuesta(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: CreateRespuestaDto,
  ) {
    return this.cotizacionesService.agregarRespuesta(empresaId, id, dto);
  }

  @Permiso('cotizaciones')
  @Put(':id/respuestas/:respuestaId/ganadora')
  marcarGanadora(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Param('respuestaId') respuestaId: string,
  ) {
    return this.cotizacionesService.marcarGanadora(empresaId, id, respuestaId);
  }
}
