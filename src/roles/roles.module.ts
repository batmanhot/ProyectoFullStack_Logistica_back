import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { PermisosGuard } from '../common/guards/permisos.guard';
import { RolesEspecificosGuard } from '../common/guards/roles-especificos.guard';
import { AprobacionGuard } from '../common/guards/aprobacion.guard';

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
  //
  // AprobacionGuard (2026-09-10, #11b) es la misma idea para los handlers de
  // aprobación marcados con @Aprobacion(proceso): el rol aprobador sale de
  // ReglaAprobacion (configurable por el tenant), no del código.
  providers: [
    RolesService,
    { provide: APP_GUARD, useClass: PermisosGuard },
    { provide: APP_GUARD, useClass: RolesEspecificosGuard },
    { provide: APP_GUARD, useClass: AprobacionGuard },
  ],
})
export class RolesModule {}
