import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { EmailModule } from '../../email/email.module';
import { AlertasController } from './alertas.controller';
import { AlertasService } from './alertas.service';

@Module({
  imports: [AdminAuthModule, EmailModule],
  controllers: [AlertasController],
  providers: [AlertasService],
})
export class AlertasModule {}
