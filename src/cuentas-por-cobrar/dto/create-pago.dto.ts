import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePagoDto {
  @IsNumber()
  @Min(0.01)
  monto: number;

  @IsOptional()
  @IsString()
  metodo?: string; // efectivo | transferencia | yape | plin | ...

  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsOptional()
  @IsString()
  notas?: string;
}
