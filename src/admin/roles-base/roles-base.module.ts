import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { RolesBaseController } from './roles-base.controller';
import { RolesBaseService } from './roles-base.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [RolesBaseController],
  providers: [RolesBaseService],
})
export class RolesBaseModule {}
