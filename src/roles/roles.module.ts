import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { PermisosGuard } from '../common/guards/permisos.guard';
import { RolesEspecificosGuard } from '../common/guards/roles-especificos.guard';

@Module({
  controllers: [RolesController],
  // Guards globales de autorización — mismo patrón que JwtAuthGuard en
  // AuthModule. Corren después porque AuthModule se importa antes en
  // app.module.ts y necesitan request.user ya poblado.
  // RolesEspecificosGuard (2026-09-04) es una segunda capa sobre
  // PermisosGuard: no reemplaza el permiso de módulo, solo actúa donde un
  // handler puntual lleva @SoloRoles(...) (ver
  // decorators/solo-roles.decorator.ts) — para distinguir "puede operar el
  // módulo" (el permiso, todo-o-nada) de "puede gestionar su catálogo
  // maestro completo" (este guard, rol por rol).
  providers: [
    RolesService,
    { provide: APP_GUARD, useClass: PermisosGuard },
    { provide: APP_GUARD, useClass: RolesEspecificosGuard },
  ],
})
export class RolesModule {}
