import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export const ALCANCES = ['base_datos', 'base_datos_archivos', 'configuracion'] as const;

/**
 * Registra que un respaldo del negocio existe (tomado por infra fuera de la
 * app). No ejecuta pg_dump. El destino se deriva del negocio; el tamaño y el
 * estado los informa quien registra.
 */
export class CrearRespaldoDto {
  @IsString()
  @IsNotEmpty()
  empresaId: string;

  @IsIn(ALCANCES)
  alcance: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  tamanoBytes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  retencionDias?: number;

  @IsOptional()
  @IsBoolean()
  cifrado?: boolean;

  @IsOptional()
  @IsIn(['VALIDANDO', 'COMPLETADO', 'FALLIDO'])
  estado?: string;

  @IsOptional()
  @IsString()
  nota?: string;
}
