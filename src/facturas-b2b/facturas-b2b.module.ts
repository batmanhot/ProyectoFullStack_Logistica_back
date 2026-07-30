import { Module } from '@nestjs/common';
import { FacturasB2BController } from './facturas-b2b.controller';
import { FacturasB2BService } from './facturas-b2b.service';

@Module({
  controllers: [FacturasB2BController],
  providers: [FacturasB2BService],
})
export class FacturasB2BModule {}
