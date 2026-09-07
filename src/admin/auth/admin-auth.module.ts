import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { PlatformAuditInterceptor } from '../../common/interceptors/platform-audit.interceptor';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, PlatformAdminGuard, PlatformAuditInterceptor],
  // JwtModule también se re-exporta: PlatformAdminGuard usado vía @UseGuards()
  // en otros módulos (Negocios, Planes, etc.) se instancia de nuevo en SU
  // propio contexto — necesita que JwtService esté disponible ahí también,
  // no solo aquí donde originalmente se construyó. Mismo motivo para
  // PlatformAuditInterceptor (@UseInterceptors) — se exporta para que todo
  // módulo que ya importa AdminAuthModule (todos los de /admin/*) pueda
  // usarlo sin declararlo de nuevo.
  exports: [PlatformAdminGuard, PlatformAuditInterceptor, JwtModule],
})
export class AdminAuthModule {}
