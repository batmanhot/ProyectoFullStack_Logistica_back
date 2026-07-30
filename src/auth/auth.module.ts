import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [
    // Secrets y expiración se resuelven por-llamada en AuthService (access
    // y refresh usan secrets distintos), por eso JwtModule se registra vacío.
    JwtModule.register({}),
    // Login exitoso/fallido se audita explícitamente (AuditoriaInterceptor no puede
    // cubrirlo: no hay JWT todavía en /auth/login).
    AuditoriaModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // Guard global: TODAS las rutas exigen JWT salvo @Public() (sección 6.4).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
