import { Module } from '@nestjs/common';
import { MovimientosModule } from '../movimientos/movimientos.module';
import { DespachosController } from './despachos.controller';
import { DespachosService } from './despachos.service';

@Module({
  imports: [MovimientosModule],
  controllers: [DespachosController],
  providers: [DespachosService],
  exports: [DespachosService],
})
export class DespachosModule {}
