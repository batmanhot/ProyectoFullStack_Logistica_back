import { Module } from '@nestjs/common';
import { OportunidadesController } from './oportunidades.controller';
import { OportunidadesService } from './oportunidades.service';

@Module({
  controllers: [OportunidadesController],
  providers: [OportunidadesService],
})
export class OportunidadesModule {}
