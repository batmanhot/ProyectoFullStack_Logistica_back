import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * Emite un documento de facturación a partir de una suscripción.
 * Si viene `renovacionId`, la factura queda vinculada a ese pago de renovación
 * (registrar el cobro lo concilia, sin crear un pago nuevo). El resto de campos
 * son el snapshot del documento: importe base (sin IGV), ciclo y vencimiento.
 */
export class EmitirFacturaDto {
  @IsOptional()
  @IsString()
  renovacionId?: string;

  @IsString()
  @IsNotEmpty()
  empresaId: string;

  @IsString()
  @IsNotEmpty()
  planId: string;

  @IsOptional()
  @IsIn(['mensual', 'anual'])
  ciclo?: string;

  @IsOptional()
  @IsString()
  moneda?: string;

  @IsNumber()
  @Min(0)
  subtotal: number;

  @IsOptional()
  @IsDateString()
  emitidaEn?: string;

  @IsDateString()
  venceEn: string;

  @IsOptional()
  @IsString()
  nota?: string;
}
