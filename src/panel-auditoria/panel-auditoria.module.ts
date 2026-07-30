import { Module } from '@nestjs/common';
import { PanelAuditoriaController } from './panel-auditoria.controller';
import { PanelAuditoriaService } from './panel-auditoria.service';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { MovimientosModule } from '../movimientos/movimientos.module';
import { CuentasPorCobrarModule } from '../cuentas-por-cobrar/cuentas-por-cobrar.module';

@Module({
  imports: [AuditoriaModule, MovimientosModule, CuentasPorCobrarModule],
  controllers: [PanelAuditoriaController],
  providers: [PanelAuditoriaService],
})
export class PanelAuditoriaModule {}
