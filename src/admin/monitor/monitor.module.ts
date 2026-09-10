import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { MonitorController } from './monitor.controller';
import { MonitorService } from './monitor.service';
import { MonitorInterceptor } from './monitor.interceptor';

/**
 * Monitor en Vivo de la plataforma (2026-09-09). El MonitorInterceptor se
 * registra como APP_INTERCEPTOR → global: toda request de /api/* alimenta el
 * ring buffer en memoria de MonitorService, y el panel del SuperAdmin lo lee.
 */
@Module({
  imports: [AdminAuthModule],
  controllers: [MonitorController],
  providers: [MonitorService, { provide: APP_INTERCEPTOR, useClass: MonitorInterceptor }],
})
export class MonitorModule {}
