import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { PlatformAdminsController } from './platform-admins.controller';
import { PlatformAdminsService } from './platform-admins.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [PlatformAdminsController],
  providers: [PlatformAdminsService],
})
export class PlatformAdminsModule {}
