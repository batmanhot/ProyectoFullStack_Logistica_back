import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateUbicacionDto {
  @IsOptional()
  @IsString()
  codigo?: string;

  @IsOptional()
  @IsString()
  tipo?: string;

  @IsOptional()
  @IsString()
  zona?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacidadMax?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  capacidadActual?: number;

  /** 'Inactiva' es el valor usado para soft-delete (ver UbicacionesService.remove). */
  @IsOptional()
  @IsString()
  estado?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;
}
