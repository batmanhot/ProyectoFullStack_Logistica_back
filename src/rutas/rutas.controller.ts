import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { RutasService } from './rutas.service';
import { CreateRutaDto } from './dto/create-ruta.dto';
import { MarcarParadaDto } from './dto/marcar-parada.dto';
import { CompletarRutaDto } from './dto/completar-ruta.dto';

@Permiso('transportes')
@Controller('rutas')
export class RutasController {
  constructor(private readonly rutasService: RutasService) {}

  @Get()
  findAll(
    @TenantId() empresaId: string,
    @Query('transportistaId') transportistaId?: string,
    @Query('estado') estado?: string,
  ) {
    return this.rutasService.findAll(empresaId, { transportistaId, estado });
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.rutasService.findOne(empresaId, id);
  }

  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateRutaDto) {
    return this.rutasService.create(empresaId, dto);
  }

  /** Despacha TODOS los despachos de la ruta (Movimientos SALIDA reales). */
  @Post(':id/iniciar')
  iniciar(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.rutasService.iniciar(empresaId, id);
  }

  @Post(':id/paradas/:despachoId')
  marcarParada(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Param('despachoId') despachoId: string,
    @Body() dto: MarcarParadaDto,
  ) {
    return this.rutasService.marcarParada(empresaId, id, despachoId, dto);
  }

  @Post(':id/completar')
  completar(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: CompletarRutaDto,
  ) {
    return this.rutasService.completar(empresaId, id, dto);
  }

  @Post(':id/cancelar')
  cancelar(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.rutasService.cancelar(empresaId, id);
  }
}
