import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTransportistaDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsIn(['PROPIO', 'TERCERO'])
  tipo: 'PROPIO' | 'TERCERO';

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
}
