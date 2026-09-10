import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { BackupsController } from './backups.controller';
import { BackupsIngestController } from './backups-ingest.controller';
import { BackupsService } from './backups.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [BackupsController, BackupsIngestController],
  providers: [BackupsService],
})
export class BackupsModule {}
