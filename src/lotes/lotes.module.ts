import { Module } from '@nestjs/common';
import { LotesController } from './lotes.controller';
import { LotesService } from './lotes.service';

@Module({
  controllers: [LotesController],
  providers: [LotesService],
})
export class LotesModule {}
