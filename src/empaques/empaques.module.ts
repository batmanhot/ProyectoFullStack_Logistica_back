import { Module } from '@nestjs/common';
import { EmpaquesController } from './empaques.controller';
import { EmpaquesService } from './empaques.service';

@Module({
  controllers: [EmpaquesController],
  providers: [EmpaquesService],
})
export class EmpaquesModule {}
