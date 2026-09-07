import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards, UseInterceptors } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { PlatformAuditInterceptor } from '../../common/interceptors/platform-audit.interceptor';
import { AlertasService } from './alertas.service';
import { CreateReglaAlertaDto } from './dto/create-regla-alerta.dto';
import { UpdateReglaAlertaDto } from './dto/update-regla-alerta.dto';

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

  @Get('envios')
  historialEnvios() {
    return this.alertasService.historialEnvios();
  }

  /** Dispara el envío ahora mismo, sin esperar al cron nocturno — útil para probar o para no perder un día. */
  @Post('enviar-pendientes')
  enviarPendientes() {
    return this.alertasService.enviarAlertasPendientes();
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
