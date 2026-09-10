import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Registrar el resultado de una comprobación de restaurabilidad. */
export class VerificarIntegridadDto {
  @IsIn(['VERIFICADO', 'CON_OBSERVACIONES', 'PENDIENTE'])
  resultado: string;

  @IsOptional()
  @IsString()
  nota?: string;
}

/** Forzar el estado del respaldo (p. ej. marcarlo COMPLETADO o FALLIDO). */
export class ActualizarEstadoRespaldoDto {
  @IsIn(['VALIDANDO', 'COMPLETADO', 'FALLIDO'])
  estado: string;

  @IsOptional()
  @IsString()
  nota?: string;
}

/** Abrir una solicitud de restauración sobre un respaldo COMPLETADO. */
export class SolicitarRestauracionDto {
  @IsString()
  @IsNotEmpty()
  motivo: string;

  @IsOptional()
  @IsString()
  nota?: string;
}

/** Registrar la aprobación documentada del cliente (obligatoria antes de ejecutar). */
export class RegistrarAprobacionDto {
  @IsString()
  @IsNotEmpty()
  contacto: string; // quién del cliente autorizó

  @IsString()
  @IsNotEmpty()
  evidencia: string; // ticket, correo, acta — referencia verificable

  @IsOptional()
  @IsString()
  nota?: string;
}

export class EjecutarRestauracionDto {
  @IsOptional()
  @IsString()
  nota?: string;
}

export class RechazarRestauracionDto {
  @IsString()
  @IsNotEmpty()
  motivo: string;
}
