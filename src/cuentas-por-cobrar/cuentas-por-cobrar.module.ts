import { Module } from '@nestjs/common';
import { CuentasPorCobrarController } from './cuentas-por-cobrar.controller';
import { CuentasPorCobrarService } from './cuentas-por-cobrar.service';

@Module({
  controllers: [CuentasPorCobrarController],
  providers: [CuentasPorCobrarService],
  exports: [CuentasPorCobrarService],
})
export class CuentasPorCobrarModule {}
