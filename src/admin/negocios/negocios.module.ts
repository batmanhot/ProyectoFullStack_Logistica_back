import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { NegociosController } from './negocios.controller';
import { NegociosService } from './negocios.service';

@Module({
  imports: [AdminAuthModule], // provee PlatformAdminGuard
  controllers: [NegociosController],
  providers: [NegociosService],
})
export class NegociosModule {}
