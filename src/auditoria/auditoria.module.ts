import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditoriaController } from './auditoria.controller';
import { AuditoriaService } from './auditoria.service';
import { AuditoriaInterceptor } from '../common/interceptors/auditoria.interceptor';

@Module({
  controllers: [AuditoriaController],
  providers: [
    AuditoriaService,
    // Registra automáticamente toda mutación (POST/PUT/PATCH/DELETE) autenticada —
    // ver auditoria.interceptor.ts. Antes de esto, registrar() nunca se invocaba
    // desde ningún otro módulo y la tabla auditoria quedaba siempre vacía.
    { provide: APP_INTERCEPTOR, useClass: AuditoriaInterceptor },
  ],
  exports: [AuditoriaService], // disponible además para que módulos registren eventos manualmente (ej. LOGIN)
})
export class AuditoriaModule {}
