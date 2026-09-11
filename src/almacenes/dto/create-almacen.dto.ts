import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateAlmacenDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  // ── Ubicación física (todo opcional) — la usa la Torre de Control de Almacenes ──
  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsString()
  ciudad?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  pais?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitud?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitud?: number;

  @IsOptional()
  @IsString()
  responsable?: string;

  @IsOptional()
  @IsString()
  telefono?: string;
}
