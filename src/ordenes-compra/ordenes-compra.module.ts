import { Module } from '@nestjs/common';
import { MovimientosModule } from '../movimientos/movimientos.module';
import { OrdenesCompraController } from './ordenes-compra.controller';
import { OrdenesCompraService } from './ordenes-compra.service';

@Module({
  imports: [MovimientosModule],
  controllers: [OrdenesCompraController],
  providers: [OrdenesCompraService],
})
export class OrdenesCompraModule {}
