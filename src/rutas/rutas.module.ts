import { Module } from '@nestjs/common';
import { DespachosModule } from '../despachos/despachos.module';
import { RutasController } from './rutas.controller';
import { RutasService } from './rutas.service';

@Module({
  imports: [DespachosModule],
  controllers: [RutasController],
  providers: [RutasService],
})
export class RutasModule {}
