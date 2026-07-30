import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DespachosModule } from '../despachos/despachos.module';
import { PortalService } from './portal.service';
import { PortalClienteController } from './portal-cliente.controller';
import { PedidosPortalAdminController } from './pedidos-portal-admin.controller';
import { PortalClienteGuard } from '../common/guards/portal-cliente.guard';

@Module({
  imports: [JwtModule.register({}), DespachosModule],
  controllers: [PortalClienteController, PedidosPortalAdminController],
  providers: [PortalService, PortalClienteGuard],
  // JwtModule se re-exporta por el mismo motivo que en AdminAuthModule
  // (Fase 7d) — PortalClienteGuard usado vía @UseGuards() necesita
  // JwtService disponible en el módulo donde se instancia.
  exports: [PortalService, JwtModule],
})
export class PortalModule {}
