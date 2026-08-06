import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

/** Reglas de negocio — Usuario (sección 5): password obligatorio en alta. */
export class CreateUsuarioDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  rolId: string;

  /** Fase 6 — solo relevante para usuarios con rol 'solicitante'. */
  @IsOptional()
  @IsString()
  areaId?: string;

  /** Fase 3 vista móvil (2026-08-05) — solo relevante para usuarios con rol 'chofer'. */
  @IsOptional()
  @IsString()
  transportistaId?: string;
}
