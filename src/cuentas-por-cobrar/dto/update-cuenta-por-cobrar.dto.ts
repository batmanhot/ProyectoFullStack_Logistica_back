import { IsDateString, IsOptional, IsString } from 'class-validator';

/** monto/saldo/estado NUNCA se editan aquí — solo vía registrarPago(). */
export class UpdateCuentaPorCobrarDto {
  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  @IsOptional()
  @IsString()
  notas?: string;
}
