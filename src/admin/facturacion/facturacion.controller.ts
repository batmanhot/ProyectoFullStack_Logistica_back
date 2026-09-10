import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { PlatformAuditInterceptor } from '../../common/interceptors/platform-audit.interceptor';
import { FacturacionService } from './facturacion.service';
import { EmitirFacturaDto } from './dto/emitir-factura.dto';
import { RegistrarCobroDto } from './dto/registrar-cobro.dto';

@Public()
@UseGuards(PlatformAdminGuard)
@UseInterceptors(PlatformAuditInterceptor)
@Controller('admin/facturacion')
export class FacturacionController {
  constructor(private readonly facturacion: FacturacionService) {}

  @Get()
  findAll(
    @Query('estado') estado?: string,
    @Query('busqueda') busqueda?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.facturacion.findAll({
      estado,
      busqueda,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('resumen')
  resumen() {
    return this.facturacion.resumen();
  }

  @Get('historial')
  historial(@Query('limite') limite?: string) {
    return this.facturacion.historial({ limite: limite ? Number(limite) : undefined });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.facturacion.findOne(id);
  }

  @Post()
  emitir(@Body() dto: EmitirFacturaDto) {
    return this.facturacion.emitir(dto);
  }

  @Patch(':id/enviar')
  marcarEnviada(@Param('id') id: string) {
    return this.facturacion.marcarEnviada(id);
  }

  @Post(':id/cobro')
  registrarCobro(@Param('id') id: string, @Body() dto: RegistrarCobroDto) {
    return this.facturacion.registrarCobro(id, dto);
  }

  @Post(':id/anular')
  anular(@Param('id') id: string) {
    return this.facturacion.anular(id);
  }
}
