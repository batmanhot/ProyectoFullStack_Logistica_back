import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { SunatService } from './sunat.service';
import { MarcarAceptadoDto } from './dto/marcar-aceptado.dto';
import { MarcarRechazadoDto } from './dto/marcar-rechazado.dto';

@Permiso('sunat')
@Controller('sunat')
export class SunatController {
  constructor(private readonly sunatService: SunatService) {}

  @Get('documentos')
  findAll(@TenantId() empresaId: string, @Query('estado') estado?: string) {
    return this.sunatService.findAll(empresaId, { estado });
  }

  /** Despachos con guía asignada — candidatos a generar su GRE. */
  @Get('despachos-con-guia')
  despachosConGuia(@TenantId() empresaId: string) {
    return this.sunatService.despachosConGuia(empresaId);
  }

  @Get('documentos/:despachoId')
  findOne(@TenantId() empresaId: string, @Param('despachoId') despachoId: string) {
    return this.sunatService.findOne(empresaId, despachoId);
  }

  /** JSON de la GRE — calculado en vivo, nunca persistido. */
  @Get('documentos/:despachoId/json')
  generarJSON(@TenantId() empresaId: string, @Param('despachoId') despachoId: string) {
    return this.sunatService.generarJSON(empresaId, despachoId);
  }

  @Post('documentos/:despachoId/generar')
  generarDocumento(@TenantId() empresaId: string, @Param('despachoId') despachoId: string) {
    return this.sunatService.generarDocumento(empresaId, despachoId);
  }

  @Post('documentos/:despachoId/marcar-enviado')
  marcarEnviado(@TenantId() empresaId: string, @Param('despachoId') despachoId: string) {
    return this.sunatService.marcarEnviado(empresaId, despachoId);
  }

  @Post('documentos/:despachoId/marcar-aceptado')
  marcarAceptado(
    @TenantId() empresaId: string,
    @Param('despachoId') despachoId: string,
    @Body() dto: MarcarAceptadoDto,
  ) {
    return this.sunatService.marcarAceptado(empresaId, despachoId, dto);
  }

  @Post('documentos/:despachoId/marcar-rechazado')
  marcarRechazado(
    @TenantId() empresaId: string,
    @Param('despachoId') despachoId: string,
    @Body() dto: MarcarRechazadoDto,
  ) {
    return this.sunatService.marcarRechazado(empresaId, despachoId, dto);
  }
}
