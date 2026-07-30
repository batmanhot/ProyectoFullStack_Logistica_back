import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { DespachosService } from './despachos.service';
import { CreateDespachoDto } from './dto/create-despacho.dto';
import { UpdateDespachoDto } from './dto/update-despacho.dto';
import { DespacharDto } from './dto/despachar.dto';
import { EntregarDto } from './dto/entregar.dto';
import { AsignarGuiaDto } from './dto/asignar-guia.dto';

@Permiso('despachos')
@Controller('despachos')
export class DespachosController {
  constructor(private readonly despachosService: DespachosService) {}

  @Get()
  findAll(
    @TenantId() empresaId: string,
    @Query('clienteId') clienteId?: string,
    @Query('estado') estado?: string,
  ) {
    return this.despachosService.findAll(empresaId, { clienteId, estado });
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.despachosService.findOne(empresaId, id);
  }

  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateDespachoDto) {
    return this.despachosService.create(empresaId, dto);
  }

  @Put(':id')
  update(@TenantId() empresaId: string, @Param('id') id: string, @Body() dto: UpdateDespachoDto) {
    return this.despachosService.update(empresaId, id, dto);
  }

  @Post(':id/aprobar')
  aprobar(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.despachosService.aprobar(empresaId, id);
  }

  @Post(':id/picking')
  iniciarPicking(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.despachosService.iniciarPicking(empresaId, id);
  }

  @Post(':id/listo')
  marcarListo(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.despachosService.marcarListo(empresaId, id);
  }

  /** Genera Movimientos SALIDA reales y libera la reserva de stock. */
  @Post(':id/despachar')
  despachar(@TenantId() empresaId: string, @Param('id') id: string, @Body() dto: DespacharDto) {
    return this.despachosService.despachar(empresaId, id, dto);
  }

  @Post(':id/entregar')
  entregar(@TenantId() empresaId: string, @Param('id') id: string, @Body() dto: EntregarDto) {
    return this.despachosService.entregar(empresaId, id, dto);
  }

  @Post(':id/cancelar')
  cancelar(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.despachosService.cancelar(empresaId, id);
  }

  /** Asigna guiaNumero a un despacho que salió sin ella (p. ej. despachado vía Ruta). */
  @Put(':id/guia')
  asignarGuia(@TenantId() empresaId: string, @Param('id') id: string, @Body() dto: AsignarGuiaDto) {
    return this.despachosService.asignarGuia(empresaId, id, dto.guiaNumero);
  }
}
