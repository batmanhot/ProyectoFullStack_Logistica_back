import { Module } from '@nestjs/common';
import { ListasPreciosController } from './listas-precios.controller';
import { ListasPreciosService } from './listas-precios.service';

@Module({
  controllers: [ListasPreciosController],
  providers: [ListasPreciosService],
})
export class ListasPreciosModule {}
