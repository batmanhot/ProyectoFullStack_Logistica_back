import { Module } from '@nestjs/common';
import { ProformasController } from './proformas.controller';
import { ProformasService } from './proformas.service';

@Module({
  controllers: [ProformasController],
  providers: [ProformasService],
})
export class ProformasModule {}
