import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Permiso } from '../common/decorators/permiso.decorator';
import { FacturasB2BService } from './facturas-b2b.service';
import { CreateFacturaB2BDto } from './dto/create-factura-b2b.dto';
import { RechazarFacturaB2BDto } from './dto/rechazar-factura-b2b.dto';

// Antes sin ningún @Permiso() — el comentario del schema ya decía "Admin-only
// por ahora" pero nunca se implementó. No se asigna 'facturas-b2b' a ningún
// rol operativo todavía (queda Owner/Admin-only vía '*'), a la espera de que
// se decida qué rol lo necesita.
@Permiso('facturas-b2b')
@Controller('facturas-b2b')
export class FacturasB2BController {
  constructor(private readonly facturasB2BService: FacturasB2BService) {}

  @Get()
  findAll(
    @TenantId() empresaId: string,
    @Query('proveedorId') proveedorId?: string,
    @Query('estado') estado?: string,
  ) {
    return this.facturasB2BService.findAll(empresaId, { proveedorId, estado });
  }

  @Get(':id')
  findOne(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.facturasB2BService.findOne(empresaId, id);
  }

  @Post()
  create(@TenantId() empresaId: string, @Body() dto: CreateFacturaB2BDto) {
    return this.facturasB2BService.create(empresaId, dto);
  }

  @Post(':id/recibir')
  marcarRecibida(@TenantId() empresaId: string, @Param('id') id: string) {
    return this.facturasB2BService.marcarRecibida(empresaId, id);
  }

  @Post(':id/rechazar')
  rechazar(
    @TenantId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: RechazarFacturaB2BDto,
  ) {
    return this.facturasB2BService.rechazar(empresaId, id, dto);
  }
}
