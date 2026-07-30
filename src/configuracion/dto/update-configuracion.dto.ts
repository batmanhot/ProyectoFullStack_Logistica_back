import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateConfiguracionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  ruc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contacto?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  direccion?: string;

  /** Switch de Configuración → Sistema. Solo tiene efecto visible si origen='demo'. */
  @IsOptional()
  @IsBoolean()
  modoDesarrollo?: boolean;
}
