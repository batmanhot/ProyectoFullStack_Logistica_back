import { IsString } from 'class-validator';

export class VincularProformaDto {
  @IsString()
  proformaId: string;
}
