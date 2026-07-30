import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateCombustibleDto {
  @IsString()
  @IsNotEmpty()
  vehiculoId: string;

  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsNumber()
  @Min(0.01)
  litros: number;

  @IsNumber()
  @Min(0)
  costo: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  kmAntes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  kmDespues?: number; // debe ser >= kmAntes — se valida en el service

  @IsOptional()
  @IsString()
  tipoCombustible?: string; // Diesel | Gasolina 90 | Gasolina 95 | Gas natural | GLP

  @IsOptional()
  @IsString()
  proveedor?: string;

  @IsOptional()
  @IsString()
  notas?: string;
}
