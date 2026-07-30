import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { LandingService } from './landing.service';
import { UpsertLandingDto } from './dto/upsert-landing.dto';

@Public()
@UseGuards(PlatformAdminGuard)
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
