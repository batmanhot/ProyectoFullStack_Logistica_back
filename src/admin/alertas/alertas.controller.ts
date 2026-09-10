import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import type { PlatformAdminPayload } from '../../common/guards/platform-admin.guard';
import { PlatformAuditInterceptor } from '../../common/interceptors/platform-audit.interceptor';
import { AlertasService } from './alertas.service';
import { CreateReglaAlertaDto } from './dto/create-regla-alerta.dto';
import { UpdateReglaAlertaDto } from './dto/update-regla-alerta.dto';
import { ReabrirAlertaSaludDto, ResolverAlertaSaludDto } from './dto/resolver-alerta-salud.dto';

@Public()
@UseGuards(PlatformAdminGuard)
@UseInterceptors(PlatformAuditInterceptor)
@Controller('admin/alertas')
export class AlertasController {
  constructor(private readonly alertasService: AlertasService) {}

  @Get()
  findAll() {
    return this.alertasService.findAll();
  }

  @Get('vencimientos-proximos')
  vencimientosProximos() {
    return this.alertasService.vencimientosProximos();
  }

  /** Bandeja unificada de alertas de salud del sistema (Centro de Alertas). */
  @Get('salud')
  salud() {
    return this.alertasService.salud();
  }

  @Get('envios')
  historialEnvios(
    @Query('limite') limite?: string,
    @Query('empresaId') empresaId?: string,
    @Query('estado') estado?: string,
  ) {
    return this.alertasService.historialEnvios({
      limite: limite ? parseInt(limite, 10) : undefined,
      empresaId,
      estado,
    });
  }

  /** Dispara el envío ahora mismo, sin esperar al cron nocturno. */
  @Post('enviar-pendientes')
  enviarPendientes() {
    return this.alertasService.enviarAlertasPendientes();
  }

  /** Marca una alerta de salud como resuelta o silenciada. */
  @Patch('salud')
  resolverSalud(@Body() dto: ResolverAlertaSaludDto, @Req() req: { platformAdmin?: PlatformAdminPayload }) {
    return this.alertasService.resolverAlertaSalud(dto.clave, dto, req.platformAdmin?.email);
  }

  /** Reabre una alerta de salud silenciada o resuelta. */
  @Post('salud/reabrir')
  reabrirSalud(@Body() dto: ReabrirAlertaSaludDto) {
    return this.alertasService.reabrirAlertaSalud(dto.clave);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.alertasService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateReglaAlertaDto) {
    return this.alertasService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateReglaAlertaDto) {
    return this.alertasService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.alertasService.remove(id);
  }
}
