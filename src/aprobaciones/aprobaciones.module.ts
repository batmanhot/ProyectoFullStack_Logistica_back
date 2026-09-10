import { Module } from '@nestjs/common';
import { AprobacionesController } from './aprobaciones.controller';
import { AprobacionesService } from './aprobaciones.service';

@Module({
  controllers: [AprobacionesController],
  providers: [AprobacionesService],
  exports: [AprobacionesService],
})
export class AprobacionesModule {}
