import { Module } from '@nestjs/common';
import { MovimientosModule } from '../movimientos/movimientos.module';
import { InventarioFisicoController } from './inventario-fisico.controller';
import { InventarioFisicoService } from './inventario-fisico.service';

@Module({
  imports: [MovimientosModule],
  controllers: [InventarioFisicoController],
  providers: [InventarioFisicoService],
})
export class InventarioFisicoModule {}
