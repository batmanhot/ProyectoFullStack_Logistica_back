import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { PortalService } from './portal.service';
import { AprobarPedidoPortalDto } from './dto/aprobar-pedido-portal.dto';
import { RechazarPedidoPortalDto } from './dto/rechazar-pedido-portal.dto';

@Permiso('portal-pedidos')
@Controller('pedidos-portal')
export class PedidosPortalAdminController {
  constructor(private readonly portalService: PortalService) {}

  @Get()
  findAll(@TenantId() empresaId: string, @Query('estado') estado?: string) {
    return this.portalService.findAllAdmin(empresaId, { estado });
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.portalService.findOneAdmin(empresaId, id);
  }

  /** Convierte en un Despacho real (con reserva de stock) vía DespachosService. */
  @Post(':id/aprobar')
  aprobar(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: AprobarPedidoPortalDto,
  ) {
    return this.portalService.aprobarYConvertir(empresaId, id, dto);
  }

  @Post(':id/rechazar')
  rechazar(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: RechazarPedidoPortalDto,
  ) {
    return this.portalService.rechazar(empresaId, id, dto);
  }
}
