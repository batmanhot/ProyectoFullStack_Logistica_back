import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { PickingService } from './picking.service';
import { ConfirmarLineaPickingDto } from './dto/confirmar-linea-picking.dto';
import { AsignarPickingDto } from './dto/asignar-picking.dto';

@Permiso('picking')
@Controller('picking')
export class PickingController {
  constructor(private readonly pickingService: PickingService) {}

  @Get(':despachoId')
  findByDespacho(@TenantId() empresaId: string, @Param('despachoId') despachoId: string) {
    return this.pickingService.findByDespacho(empresaId, despachoId);
  }

  @Put(':despachoId/asignar')
  asignar(
    @TenantId() empresaId: string,
    @Param('despachoId') despachoId: string,
    @Body() dto: AsignarPickingDto,
  ) {
    return this.pickingService.asignar(empresaId, despachoId, dto.usuarioId);
  }

  @Post(':despachoId/lineas/:lineaId/confirmar')
  confirmarLinea(
    @TenantId() empresaId: string,
    @Param('despachoId') despachoId: string,
    @Param('lineaId') lineaId: string,
    @Body() dto: ConfirmarLineaPickingDto,
  ) {
    return this.pickingService.confirmarLinea(empresaId, despachoId, lineaId, dto);
  }
}
