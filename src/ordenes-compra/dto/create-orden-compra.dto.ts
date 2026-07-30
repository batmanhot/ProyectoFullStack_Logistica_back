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

/** Reglas de negocio — Orden de compra (sección 5 / validateOrden en validators.js). */
export class CreateOrdenCompraItemDto {
  @IsString()
  @IsNotEmpty()
  productoId: string;

  @IsNumber()
  @Min(0.01, { message: 'Cada ítem debe tener cantidad mayor a cero' })
  cantidad: number;

  @IsNumber()
  @Min(0, { message: 'El costo unitario de un ítem no puede ser negativo' })
  costoUnitario: number;
}

export class CreateOrdenCompraDto {
  @IsString()
  @IsNotEmpty()
  proveedorId: string;

  /** A dónde entra la mercadería al recibir — necesario para generar el Movimiento. */
  @IsString()
  @IsNotEmpty()
  almacenId: string;

  @IsOptional()
  @IsDateString()
  fechaEntrega?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'La orden debe tener al menos un ítem' })
  @ValidateNested({ each: true })
  @Type(() => CreateOrdenCompraItemDto)
  items: CreateOrdenCompraItemDto[];
}
