import { Body, Controller, Get, Put, UseGuards, UseInterceptors } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { PlatformAuditInterceptor } from '../../common/interceptors/platform-audit.interceptor';
import { LandingService } from './landing.service';
import { UpsertLandingDto } from './dto/upsert-landing.dto';

@Public()
@UseGuards(PlatformAdminGuard)
@UseInterceptors(PlatformAuditInterceptor)
@Controller('admin/landing')
export class LandingController {
  constructor(private readonly landingService: LandingService) {}

  @Get()
  get() {
    return this.landingService.get();
  }

  @Put()
  upsert(@Body() dto: UpsertLandingDto) {
    return this.landingService.upsert(dto);
  }
}
