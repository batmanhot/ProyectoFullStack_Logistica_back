import { Module } from '@nestjs/common';
import { PickingController } from './picking.controller';
import { PickingService } from './picking.service';

@Module({
  controllers: [PickingController],
  providers: [PickingService],
  exports: [PickingService],
})
export class PickingModule {}
