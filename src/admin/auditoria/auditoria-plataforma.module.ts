import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AuditoriaModule } from '../../auditoria/auditoria.module';
import { AuditoriaPlataformaController } from './auditoria-plataforma.controller';
import { AuditoriaPlataformaService } from './auditoria-plataforma.service';

@Module({
  imports: [AdminAuthModule, AuditoriaModule],
  controllers: [AuditoriaPlataformaController],
  providers: [AuditoriaPlataformaService],
})
export class AuditoriaPlataformaModule {}
