import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { PlanesController } from './planes.controller';
import { PlanesService } from './planes.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [PlanesController],
  providers: [PlanesService],
  exports: [PlanesService],
})
export class PlanesModule {}
