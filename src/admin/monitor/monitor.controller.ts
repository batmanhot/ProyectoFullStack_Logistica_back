import { Controller, Get, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { MonitorService } from './monitor.service';

@Public() // bypass del guard de tenant — usa PlatformAdminGuard
@UseGuards(PlatformAdminGuard)
@SkipThrottle() // el panel hace polling cada 5s; no debe chocar con el rate-limit global
@Controller('admin/monitor')
export class MonitorController {
  constructor(private readonly monitor: MonitorService) {}

  @Get('resumen')
  resumen() {
    return this.monitor.resumen();
  }

  @Get('incidentes')
  incidentes() {
    return this.monitor.incidentes();
  }
}
