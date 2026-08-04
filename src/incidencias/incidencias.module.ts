import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { IncidenciasController } from './incidencias.controller';
import { IncidenciasService } from './incidencias.service';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';

@Module({
  controllers: [IncidenciasController],
  providers: [
    IncidenciasService,
    // Antes se instanciaba a mano en main.ts (`new HttpExceptionFilter()`),
    // lo que impedía inyectarle IncidenciasService. Vía APP_FILTER queda
    // resuelto por el contenedor de Nest, igual patrón que AuditoriaModule
    // usa para su APP_INTERCEPTOR.
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class IncidenciasModule {}
