import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { RenovacionesController } from './renovaciones.controller';
import { RenovacionesService } from './renovaciones.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [RenovacionesController],
  providers: [RenovacionesService],
})
export class RenovacionesModule {}
