import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { LandingService } from '../admin/landing/landing.service';
import { PlanesService } from '../admin/planes/planes.service';

/** Endpoints de solo-lectura sin autenticación para la landing page pública. */
@Public()
@Controller('public')
export class PublicController {
  constructor(
    private readonly landingService: LandingService,
    private readonly planesService: PlanesService,
  ) {}

  @Get('landing')
  getLanding() {
    return this.landingService.get();
  }

  @Get('planes')
  getPlanes() {
    return this.planesService.findAll(false, true);
  }
}
