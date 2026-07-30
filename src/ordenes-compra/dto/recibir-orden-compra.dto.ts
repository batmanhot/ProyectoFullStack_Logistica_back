import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNotEmpty, IsNumber, IsString, Min, ValidateNested } from 'class-validator';

export class RecibirItemDto {
  @IsString()
  @IsNotEmpty()
  ordenCompraItemId: string;

  /** Cantidad recibida AHORA (puede ser parcial respecto al ítem completo). */
  @IsNumber()
  @Min(0.01)
  cantidad: number;
}

export class RecibirOrdenCompraDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecibirItemDto)
  items: RecibirItemDto[];
}
