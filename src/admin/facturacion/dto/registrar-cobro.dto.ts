import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Confirma el cobro de una factura emitida: método, referencia y fecha. */
export class RegistrarCobroDto {
  @IsString()
  @IsNotEmpty()
  metodoPago: string; // tarjeta | transferencia | efectivo | yape | paypal

  @IsString()
  @IsNotEmpty()
  referenciaPago: string; // N° de operación, voucher o ID de pasarela

  @IsOptional()
  @IsDateString()
  pagadaEn?: string;
}
