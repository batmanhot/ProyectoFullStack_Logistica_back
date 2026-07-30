import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

/**
 * Solo permite mover manualmente a APROBADA o CANCELADA. PARCIAL y RECIBIDA
 * se calculan automáticamente al recepcionar (ver RecibirOrdenCompraDto) —
 * nunca se setean a mano, para que el estado siempre refleje lo realmente
 * recibido en Inventario.
 */
export class UpdateOrdenCompraDto {
  @IsOptional()
  @IsDateString()
  fechaEntrega?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  @IsIn(['APROBADA', 'CANCELADA'])
  estado?: 'APROBADA' | 'CANCELADA';
}
