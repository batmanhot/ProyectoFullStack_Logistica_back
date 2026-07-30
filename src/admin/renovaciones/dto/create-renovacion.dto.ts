import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateRenovacionDto {
  @IsString()
  @IsNotEmpty()
  empresaId: string;

  @IsString()
  @IsNotEmpty()
  planId: string;

  @IsNumber()
  @Min(0.01)
  monto: number;

  @IsOptional()
  @IsString()
  moneda?: string;

  @IsIn(['mensual', 'anual'])
  ciclo: string;

  @IsOptional()
  @IsDateString()
  fechaPago?: string;

  @IsString()
  @IsNotEmpty()
  metodoPago: string; // tarjeta | transferencia | efectivo | paypal | yape

  @IsDateString()
  periodoInicio: string;

  @IsDateString()
  periodoFin: string;

  @IsOptional()
  @IsString()
  comprobante?: string;
}
