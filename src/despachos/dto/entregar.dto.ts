import { IsOptional, IsString } from 'class-validator';

export class EntregarDto {
  @IsOptional()
  @IsString()
  receptorNombre?: string;

  /** Data URI base64 de la foto de evidencia (opcional). */
  @IsOptional()
  @IsString()
  evidenciaFoto?: string;

  @IsOptional()
  @IsString()
  evidenciaNotas?: string;
}
