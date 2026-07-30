import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/** Reglas de negocio — Usuario (sección 5): password NO obligatorio en update. */
export class UpdateUsuarioDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsString()
  rolId?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  /** Fase 6 — solo relevante para usuarios con rol 'solicitante'. */
  @IsOptional()
  @IsString()
  areaId?: string;
}
