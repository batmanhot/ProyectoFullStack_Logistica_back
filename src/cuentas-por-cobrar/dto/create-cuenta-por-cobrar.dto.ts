import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateCuentaPorCobrarDto {
  @IsString()
  @IsNotEmpty()
  clienteId: string;

  @IsNumber()
  @Min(0.01)
  monto: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  diasCredito?: number; // default 30

  /** Si no se envía, se calcula como fechaEmision + diasCredito. */
  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  /** Ahora con FK real a Despacho (Fase 5) — se valida que exista y pertenezca al tenant. */
  @IsOptional()
  @IsString()
  despachoId?: string;
}
