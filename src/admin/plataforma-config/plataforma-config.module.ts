import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { PlataformaConfigController } from './plataforma-config.controller';
import { PlataformaConfigService } from './plataforma-config.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [PlataformaConfigController],
  providers: [PlataformaConfigService],
  exports: [PlataformaConfigService],
})
export class PlataformaConfigModule {}
