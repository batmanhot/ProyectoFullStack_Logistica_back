import { IsBoolean, IsEmail, IsNumber, IsOptional, IsString, Min, MinLength, ValidateIf } from 'class-validator';

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

  /** Fase 3 vista móvil (2026-08-05) — solo relevante para usuarios con rol 'chofer'. */
  @IsOptional()
  @IsString()
  transportistaId?: string;

  /**
   * Fase 10 Gestión Comercial (2026-09-03) — solo relevante para
   * 'ejecutivo-comercial'. Acepta `null` explícito para poder quitar una
   * meta ya configurada (el cliente aclaró que no todo vendedor debe tener
   * una — algunos venden solo por teléfono/WhatsApp/correo sin cuota fija).
   */
  @IsOptional()
  @ValidateIf((o) => o.metaVentasMensual !== null)
  @IsNumber()
  @Min(0)
  metaVentasMensual?: number | null;

  /** Datos de perfil (2026-09-09) — opcionales. */
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsString() documento?: string;
  @IsOptional() @IsString() cargo?: string;
}
