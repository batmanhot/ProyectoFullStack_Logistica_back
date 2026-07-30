import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateFacturaB2BDto {
  @IsString()
  @IsNotEmpty()
  ordenCompraId: string;

  @IsString()
  @IsNotEmpty()
  numero: string;

  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monto?: number;

  @IsOptional()
  @IsString()
  notas?: string;
}
