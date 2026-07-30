import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class UpdateLoteDto {
  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  /** cantidadActual NUNCA se edita aquí — solo lo cambian los Movimientos. */
  @IsOptional()
  @IsIn(['Vigente', 'Por Vencer', 'Vencido'])
  estado?: string;
}
