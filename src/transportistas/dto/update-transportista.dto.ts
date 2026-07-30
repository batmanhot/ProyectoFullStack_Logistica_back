import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateTransportistaDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsIn(['PROPIO', 'TERCERO'])
  tipo?: 'PROPIO' | 'TERCERO';

  @IsOptional()
  @IsString()
  placa?: string;

  @IsOptional()
  @IsString()
  vehiculo?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  licencia?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
