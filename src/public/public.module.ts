import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { LandingModule } from '../admin/landing/landing.module';
import { PlanesModule } from '../admin/planes/planes.module';

@Module({
  imports: [LandingModule, PlanesModule],
  controllers: [PublicController],
})
export class PublicModule {}
