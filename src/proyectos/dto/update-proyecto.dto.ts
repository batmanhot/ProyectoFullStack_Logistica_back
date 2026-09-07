import { IsBoolean, IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateProyectoDto {
  @IsOptional()
  @IsString()
  codigo?: string;

  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  clienteId?: string;

  @IsOptional()
  @IsString()
  cdrId?: string;

  @IsOptional()
  @IsIn(['EN_EJECUCION', 'CERRADO'])
  estado?: 'EN_EJECUCION' | 'CERRADO';

  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsDateString()
  fechaFin?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
