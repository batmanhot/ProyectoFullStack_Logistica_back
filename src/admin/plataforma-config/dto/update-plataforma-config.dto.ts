import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdatePlataformaConfigDto {
  /** SuperAdmin → Ajustes: mostrar tarjetas de acceso rápido en el Login para todos los negocios. */
  @IsOptional()
  @IsBoolean()
  accesoRapidoTarjetas?: boolean;

  /** Días que se conserva la Bitácora de plataforma antes de purgarse. */
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(3650)
  retencionAuditoriaDias?: number;
}
