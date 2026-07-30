import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { PermisosGuard } from '../common/guards/permisos.guard';

@Module({
  controllers: [RolesController],
  // Guard global de permisos por rol (Fase 3) — mismo patrón que JwtAuthGuard
  // en AuthModule. Corre después porque AuthModule se importa antes en
  // app.module.ts y necesita request.user ya poblado.
  providers: [RolesService, { provide: APP_GUARD, useClass: PermisosGuard }],
})
export class RolesModule {}
