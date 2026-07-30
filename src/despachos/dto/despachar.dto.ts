import { IsOptional, IsString } from 'class-validator';

export class DespacharDto {
  @IsOptional()
  @IsString()
  guiaNumero?: string;
}
