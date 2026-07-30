import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateMantenimientoDto {
  @IsOptional()
  @IsString()
  tipo?: string;

  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  kmActual?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costo?: number;

  @IsOptional()
  @IsString()
  taller?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;
}
