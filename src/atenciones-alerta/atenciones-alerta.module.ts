import { Module } from '@nestjs/common';
import { AtencionesAlertaController } from './atenciones-alerta.controller';
import { AtencionesAlertaService } from './atenciones-alerta.service';

@Module({
  controllers: [AtencionesAlertaController],
  providers: [AtencionesAlertaService],
})
export class AtencionesAlertaModule {}
