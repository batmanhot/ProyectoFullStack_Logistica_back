import { Module } from '@nestjs/common';
import { DespachosModule } from '../despachos/despachos.module';
import { ProformasController } from './proformas.controller';
import { ProformasService } from './proformas.service';

@Module({
  imports: [DespachosModule],
  controllers: [ProformasController],
  providers: [ProformasService],
})
export class ProformasModule {}
