import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PortalClienteGuard, PortalClientePayload } from '../common/guards/portal-cliente.guard';
import { CurrentPortalCliente } from '../common/decorators/portal-cliente.decorator';
import { PortalService } from './portal.service';
import { CrearPedidoPortalDto } from './dto/crear-pedido-portal.dto';

@Public() // bypass del guard de tenant — esta ruta usa PortalClienteGuard, no JWT de Usuario
@UseGuards(PortalClienteGuard)
@Controller('portal')
export class PortalClienteController {
  constructor(private readonly portalService: PortalService) {}

  @Get('catalogo')
  catalogo(@CurrentPortalCliente() cliente: PortalClientePayload) {
    return this.portalService.catalogo(cliente.empresaId);
  }

  @Get('despachos')
  misDespachos(@CurrentPortalCliente() cliente: PortalClientePayload) {
    return this.portalService.misDespachos(cliente.empresaId, cliente.sub);
  }

  @Get('pedidos')
  misPedidos(@CurrentPortalCliente() cliente: PortalClientePayload) {
    return this.portalService.misPedidos(cliente.empresaId, cliente.sub);
  }

  @Post('pedidos')
  crearPedido(
    @CurrentPortalCliente() cliente: PortalClientePayload,
    @Body() dto: CrearPedidoPortalDto,
  ) {
    return this.portalService.crearPedido(cliente.empresaId, cliente.sub, dto);
  }
}
