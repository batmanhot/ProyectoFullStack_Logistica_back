import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

/** RESPONDIDA/ADJUDICADA se calculan solos (al recibir respuestas / marcar ganadora). */
export class UpdateCotizacionDto {
  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  @IsIn(['ENVIADA', 'CANCELADA'])
  estado?: 'ENVIADA' | 'CANCELADA';
}
