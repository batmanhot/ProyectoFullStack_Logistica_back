import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateRespuestaItemDto {
  @IsString()
  @IsNotEmpty()
  productoId: string;

  @IsNumber()
  @Min(0)
  precioUnitario: number;
}

/** Respuesta de UN proveedor a una Cotizacion (RFQ). subtotal/total se calculan server-side. */
export class CreateRespuestaDto {
  @IsString()
  @IsNotEmpty()
  proveedorId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  tiempoEntrega?: number; // días

  @IsOptional()
  @IsString()
  notas?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateRespuestaItemDto)
  items: CreateRespuestaItemDto[];
}
