import { IsOptional, IsString } from 'class-validator';

export class RechazarFacturaB2BDto {
  @IsOptional()
  @IsString()
  motivo?: string;
}
