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

export class CreateProformaItemDto {
  @IsString()
  @IsNotEmpty()
  productoId: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsNumber()
  @Min(0.01)
  cantidad: number;

  @IsNumber()
  @Min(0)
  precioUnitario: number;
}

/** Proforma = cotización de VENTA a un Cliente (distinta de Cotizacion/RFQ a proveedores). */
export class CreateProformaDto {
  @IsString()
  @IsNotEmpty()
  clienteId: string;

  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'La proforma debe tener al menos un ítem' })
  @ValidateNested({ each: true })
  @Type(() => CreateProformaItemDto)
  items: CreateProformaItemDto[];
}
