import { Module } from '@nestjs/common';
import { MovimientosModule } from '../movimientos/movimientos.module';
import { PedidosInternosController } from './pedidos-internos.controller';
import { PedidosInternosService } from './pedidos-internos.service';

@Module({
  imports: [MovimientosModule],
  controllers: [PedidosInternosController],
  providers: [PedidosInternosService],
})
export class PedidosInternosModule {}
