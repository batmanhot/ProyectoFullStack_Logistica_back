import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

/** Solo aplicable mientras el pedido está en BORRADOR. */
export class UpdatePedidoInternoDto {
  @IsOptional()
  @IsDateString()
  fechaRequerida?: string;

  @IsOptional()
  @IsIn(['NORMAL', 'URGENTE', 'CRITICO'])
  prioridad?: 'NORMAL' | 'URGENTE' | 'CRITICO';

  @IsOptional()
  @IsString()
  notasSolicitud?: string;
}
