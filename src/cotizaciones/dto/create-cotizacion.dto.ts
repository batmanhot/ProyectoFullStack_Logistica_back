import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateCotizacionItemDto {
  @IsString()
  @IsNotEmpty()
  productoId: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsNumber()
  @Min(0.01)
  cantidad: number;
}

/** Cotizacion = RFQ a proveedores (NO es cotización de venta — ver Proforma). */
export class CreateCotizacionDto {
  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  // Por analogía con la regla "al menos un ítem" de Orden de Compra (sección 5)
  // — el documento no define reglas para Cotizacion explícitamente.
  @IsArray()
  @ArrayMinSize(1, { message: 'La cotización debe tener al menos un ítem' })
  @ValidateNested({ each: true })
  @Type(() => CreateCotizacionItemDto)
  items: CreateCotizacionItemDto[];
}
