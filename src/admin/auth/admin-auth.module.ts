import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, PlatformAdminGuard],
  // JwtModule también se re-exporta: PlatformAdminGuard usado vía @UseGuards()
  // en otros módulos (Negocios, Planes, etc.) se instancia de nuevo en SU
  // propio contexto — necesita que JwtService esté disponible ahí también,
  // no solo aquí donde originalmente se construyó.
  exports: [PlatformAdminGuard, JwtModule],
})
export class AdminAuthModule {}
