import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { LandingController } from './landing.controller';
import { LandingService } from './landing.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [LandingController],
  providers: [LandingService],
  exports: [LandingService],
})
export class LandingModule {}
