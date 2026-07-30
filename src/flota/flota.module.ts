import { Module } from '@nestjs/common';
import { FlotaController } from './flota.controller';
import { FlotaService } from './flota.service';

@Module({
  controllers: [FlotaController],
  providers: [FlotaService],
})
export class FlotaModule {}
