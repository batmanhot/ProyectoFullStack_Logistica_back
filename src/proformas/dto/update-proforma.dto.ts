import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateProformaDto {
  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  // ACEPTADA sale por POST /proformas/:id/aceptar (aprobación configurable #11b).
  @IsOptional()
  @IsIn(['ENVIADA', 'RECHAZADA', 'VENCIDA'])
  estado?: 'ENVIADA' | 'RECHAZADA' | 'VENCIDA';
}
