import { Body, Controller, Get, Put, UseGuards, UseInterceptors } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { PlatformAuditInterceptor } from '../../common/interceptors/platform-audit.interceptor';
import { PlataformaConfigService } from './plataforma-config.service';
import { UpdatePlataformaConfigDto } from './dto/update-plataforma-config.dto';

@Public()
@UseGuards(PlatformAdminGuard)
@UseInterceptors(PlatformAuditInterceptor)
@Controller('admin/plataforma-config')
export class PlataformaConfigController {
  constructor(private readonly service: PlataformaConfigService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Put()
  update(@Body() dto: UpdatePlataformaConfigDto) {
    return this.service.update(dto);
  }
}
