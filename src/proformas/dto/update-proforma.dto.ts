import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateProformaDto {
  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  @IsIn(['ENVIADA', 'ACEPTADA', 'RECHAZADA', 'VENCIDA'])
  estado?: 'ENVIADA' | 'ACEPTADA' | 'RECHAZADA' | 'VENCIDA';
}
