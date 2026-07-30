import { Module } from '@nestjs/common';
import { AreasInternasController } from './areas-internas.controller';
import { AreasInternasService } from './areas-internas.service';

@Module({
  controllers: [AreasInternasController],
  providers: [AreasInternasService],
})
export class AreasInternasModule {}
