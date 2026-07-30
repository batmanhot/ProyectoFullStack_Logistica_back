import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PortalProveedorService } from './portal-proveedor.service';
import { PortalProveedorController } from './portal-proveedor.controller';
import { PortalProveedorGuard } from '../common/guards/portal-proveedor.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [PortalProveedorController],
  providers: [PortalProveedorService, PortalProveedorGuard],
  // JwtModule se re-exporta por el mismo motivo que PortalModule —
  // PortalProveedorGuard usado vía @UseGuards() necesita JwtService
  // disponible en el módulo donde se instancia.
  exports: [PortalProveedorService, JwtModule],
})
export class PortalProveedorModule {}
