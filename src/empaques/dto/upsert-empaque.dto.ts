import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { TIPOS_CAJA_IDS } from '../tipos-caja.constant';

export class UpsertEmpaqueDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(TIPOS_CAJA_IDS, { message: `tipoCajaId debe ser uno de: ${TIPOS_CAJA_IDS.join(', ')}` })
  tipoCajaId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bultos?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pesoTotal?: number;

  @IsOptional()
  @IsString()
  instrucciones?: string;

  @IsOptional()
  @IsBoolean()
  fragil?: boolean;

  /** true = "Confirmar empaque" (estado CONFIRMADO); false/omitido = "Guardar borrador" (PENDIENTE). */
  @IsOptional()
  @IsBoolean()
  confirmar?: boolean;
}
