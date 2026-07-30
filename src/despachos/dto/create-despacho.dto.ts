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

export class CreateDespachoItemDto {
  @IsString()
  @IsNotEmpty()
  productoId: string;

  @IsNumber()
  @Min(0.01)
  cantidad: number;

  @IsNumber()
  @Min(0)
  precioVenta: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costoUnitario?: number;
}

export class CreateDespachoDto {
  @IsString()
  @IsNotEmpty()
  clienteId: string;

  @IsString()
  @IsNotEmpty()
  almacenId: string;

  @IsOptional()
  @IsDateString()
  fechaEntrega?: string;

  @IsOptional()
  @IsString()
  direccionEntrega?: string;

  @IsOptional()
  @IsString()
  transportistaId?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;

  // Por analogía con la regla "al menos un ítem" de Orden de Compra/Cotizacion.
  @IsArray()
  @ArrayMinSize(1, { message: 'El despacho debe tener al menos un ítem' })
  @ValidateNested({ each: true })
  @Type(() => CreateDespachoItemDto)
  items: CreateDespachoItemDto[];
}
