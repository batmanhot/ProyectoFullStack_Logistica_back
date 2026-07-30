import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { EmpaquesService } from './empaques.service';
import { UpsertEmpaqueDto } from './dto/upsert-empaque.dto';

@Permiso('empaque')
@Controller('empaques')
export class EmpaquesController {
  constructor(private readonly empaquesService: EmpaquesService) {}

  /**
   * Catálogo fijo de tipos de caja. Se mantiene detrás de JWT como todo
   * el resto de la API, por consistencia, aunque no contenga datos de tenant.
   */
  @Get('tipos-caja')
  tiposCaja() {
    return this.empaquesService.tiposCaja();
  }

  @Get()
  findAll(
    @TenantId() empresaId: string,
    @Query('estadoDespacho') estadoDespacho?: string,
    @Query('estadoEmpaque') estadoEmpaque?: 'sin' | 'pendiente' | 'confirmado',
  ) {
    return this.empaquesService.findAll(empresaId, { estadoDespacho, estadoEmpaque });
  }

  @Get(':despachoId')
  findOne(@TenantId() empresaId: string, @Param('despachoId') despachoId: string) {
    return this.empaquesService.findOne(empresaId, despachoId);
  }

  @Put(':despachoId')
  upsert(
    @TenantId() empresaId: string,
    @Param('despachoId') despachoId: string,
    @Body() dto: UpsertEmpaqueDto,
  ) {
    return this.empaquesService.upsert(empresaId, despachoId, dto);
  }
}
