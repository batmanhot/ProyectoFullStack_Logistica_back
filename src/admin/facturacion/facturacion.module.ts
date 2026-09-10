import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { FacturacionController } from './facturacion.controller';
import { FacturacionService } from './facturacion.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [FacturacionController],
  providers: [FacturacionService],
})
export class FacturacionModule {}
