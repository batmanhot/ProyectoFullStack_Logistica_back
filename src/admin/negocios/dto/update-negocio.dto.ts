import { IsBoolean, IsDateString, IsEmail, IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateNegocioDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @Matches(/^\d{8,11}$/, { message: 'El RUC debe tener entre 8 y 11 dígitos numéricos' })
  ruc?: string;

  @IsOptional()
  @IsString()
  contacto?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @IsIn(['activo', 'suspendido', 'cancelado'])
  estado?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  @IsOptional()
  @IsString()
  notas?: string;
}
