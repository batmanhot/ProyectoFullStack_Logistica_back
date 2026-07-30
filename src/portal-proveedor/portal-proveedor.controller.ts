import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PortalProveedorGuard, PortalProveedorPayload } from '../common/guards/portal-proveedor.guard';
import { CurrentPortalProveedor } from '../common/decorators/portal-proveedor.decorator';
import { PortalProveedorService } from './portal-proveedor.service';
import { CreateFacturaB2BDto } from '../facturas-b2b/dto/create-factura-b2b.dto';

@Public() // bypass del guard de tenant — esta ruta usa PortalProveedorGuard, no JWT de Usuario
@UseGuards(PortalProveedorGuard)
@Controller('portal-proveedor')
export class PortalProveedorController {
  constructor(private readonly portalProveedorService: PortalProveedorService) {}

  @Get('ordenes')
  misOrdenes(@CurrentPortalProveedor() proveedor: PortalProveedorPayload) {
    return this.portalProveedorService.misOrdenes(proveedor.empresaId, proveedor.sub);
  }

  @Get('facturas')
  misFacturas(@CurrentPortalProveedor() proveedor: PortalProveedorPayload) {
    return this.portalProveedorService.misFacturas(proveedor.empresaId, proveedor.sub);
  }

  @Post('facturas')
  crearFactura(
    @CurrentPortalProveedor() proveedor: PortalProveedorPayload,
    @Body() dto: CreateFacturaB2BDto,
  ) {
    return this.portalProveedorService.crearFactura(proveedor.empresaId, proveedor.sub, dto);
  }
}
