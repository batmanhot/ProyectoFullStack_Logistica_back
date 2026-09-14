import { IsString, MinLength } from 'class-validator';

export class MarcarAtendidaDto {
  /** Código de tipo de alerta — mismo que TIPOS en utils/alertas.js (frontend). */
  @IsString()
  tipo: string;

  /** Identificador estable de la instancia real detrás de la alerta (productoId, numero de OC, despachoId, etc.). */
  @IsString()
  clave: string;

  /** Qué hizo el responsable para atenderla. */
  @IsString()
  @MinLength(3)
  notaAccion: string;
}
