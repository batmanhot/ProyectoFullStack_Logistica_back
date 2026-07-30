import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AlertasController } from './alertas.controller';
import { AlertasService } from './alertas.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [AlertasController],
  providers: [AlertasService],
})
export class AlertasModule {}
