import { Module } from '@nestjs/common';
import { UbicacionesController } from './ubicaciones.controller';
import { UbicacionesService } from './ubicaciones.service';

@Module({
  controllers: [UbicacionesController],
  providers: [UbicacionesService],
})
export class UbicacionesModule {}
