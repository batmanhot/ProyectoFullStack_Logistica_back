import { Module } from '@nestjs/common';
import { AlmacenesController } from './almacenes.controller';
import { AlmacenesService } from './almacenes.service';

@Module({
  controllers: [AlmacenesController],
  providers: [AlmacenesService],
})
export class AlmacenesModule {}
