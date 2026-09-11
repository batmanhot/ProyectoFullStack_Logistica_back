import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateAlmacenDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  /** Permite reactivar (PUT con activo: true) sin un endpoint de restore separado. */
  @IsOptional()
  @IsBoolean()
  activo?: boolean;

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
