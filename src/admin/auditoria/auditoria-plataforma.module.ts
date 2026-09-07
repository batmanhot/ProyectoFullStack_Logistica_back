import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AuditoriaPlataformaController } from './auditoria-plataforma.controller';
import { AuditoriaPlataformaService } from './auditoria-plataforma.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [AuditoriaPlataformaController],
  providers: [AuditoriaPlataformaService],
})
export class AuditoriaPlataformaModule {}
