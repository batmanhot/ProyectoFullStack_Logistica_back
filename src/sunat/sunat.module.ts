import { Module } from '@nestjs/common';
import { SunatController } from './sunat.controller';
import { SunatService } from './sunat.service';

@Module({
  controllers: [SunatController],
  providers: [SunatService],
})
export class SunatModule {}
