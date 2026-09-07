import { Module } from '@nestjs/common';
import { CdrController } from './cdr.controller';
import { CdrService } from './cdr.service';

@Module({
  controllers: [CdrController],
  providers: [CdrService],
  exports: [CdrService],
})
export class CdrModule {}
