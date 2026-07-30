import { IsBoolean, IsEmail, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateProveedorDto {
  @IsOptional()
  @IsString()
  razonSocial?: string;

  @IsOptional()
  @Matches(/^\d{8,11}$/, { message: 'El RUC debe tener entre 8 y 11 dígitos numéricos' })
  ruc?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
