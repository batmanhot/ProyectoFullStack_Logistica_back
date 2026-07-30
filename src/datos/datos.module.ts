import { Module } from '@nestjs/common';
import { DatosController } from './datos.controller';
import { DatosService } from './datos.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DatosController],
  providers: [DatosService],
})
export class DatosModule {}
