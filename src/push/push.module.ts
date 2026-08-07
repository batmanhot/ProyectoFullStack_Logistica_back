import { Module } from '@nestjs/common';
import { LandingModule } from '../admin/landing/landing.module';
import { PushController } from './push.controller';
import { PushService } from './push.service';

@Module({
  imports: [LandingModule],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
