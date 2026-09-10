import { IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

/**
 * El job de backup reporta un respaldo ya tomado y subido al object storage.
 * `empresaId` ausente ⇒ respaldo de toda la plataforma (pg_dump completo).
 */
export class IngestarRespaldoDto {
  @IsOptional()
  @IsString()
  empresaId?: string;

  @IsIn(['base_datos', 'base_datos_archivos', 'configuracion', 'plataforma_completa'])
  alcance: string;

  @IsIn(['pg_dump', 'json_tenant'])
  formato: string;

  @IsString()
  @IsNotEmpty()
  storageKey: string; // bucket/key del artefacto cifrado

  @IsOptional()
  @IsString()
  checksum?: string; // sha256 hex

  @IsOptional()
  @IsInt()
  @Min(0)
  tamanoBytes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  retencionDias?: number;

  @IsOptional()
  @IsIn(['COMPLETADO', 'FALLIDO'])
  estado?: string; // default COMPLETADO

  @IsOptional()
  @IsDateString()
  tomadoEn?: string;

  @IsOptional()
  @IsString()
  nota?: string;
}

/** El script `restore-tenant.mjs` reporta el resultado de una restauración ejecutada. */
export class ResultadoRestauracionDto {
  @IsString()
  @IsNotEmpty()
  solicitudId: string;

  @IsIn(['ok', 'fallo'])
  resultado: string;

  @IsString()
  @IsNotEmpty()
  log: string; // resumen de lo que hizo el script (filas borradas/insertadas, duración)

  @IsOptional()
  @IsString()
  snapshotStorageKey?: string; // storageKey del "snapshot previo" que tomó el script
}

/** El job de CI reporta el resultado del test de restauración periódico. */
export class PruebaRestauracionDto {
  @IsIn(['ok', 'fallo'])
  resultado: string;

  @IsOptional()
  @IsString()
  detalle?: string;

  @IsOptional()
  @IsString()
  dumpProbado?: string; // storageKey del dump probado

  @IsOptional()
  @IsInt()
  @Min(0)
  duracionMs?: number;
}
