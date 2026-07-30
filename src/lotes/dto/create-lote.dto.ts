import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateLoteDto {
  @IsString()
  @IsNotEmpty()
  productoId: string;

  @IsString()
  @IsNotEmpty()
  numero: string;

  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  @IsNumber()
  @Min(0.01)
  cantidadOriginal: number;
}
