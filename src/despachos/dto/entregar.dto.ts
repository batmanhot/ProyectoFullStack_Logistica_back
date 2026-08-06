import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Trazabilidad de entrega (2026-08-05): nombre del receptor y foto de
// evidencia son obligatorios para confirmar — antes eran opcionales tanto
// acá como en el frontend, y no había ninguna validación real bloqueando.
export class EntregarDto {
  @IsString()
  @IsNotEmpty()
  receptorNombre: string;

  /** Data URI base64 de la foto de evidencia. */
  @IsString()
  @IsNotEmpty()
  evidenciaFoto: string;

  @IsOptional()
  @IsString()
  evidenciaNotas?: string;
}
