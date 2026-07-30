import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreatePedidoInternoItemDto {
  @IsString()
  @IsNotEmpty()
  productoId: string;

  @IsNumber()
  @Min(0.01)
  cantidad: number;

  @IsOptional()
  @IsString()
  unidadMedida?: string;

  @IsOptional()
  @IsString()
  notas?: string;
}

export class CreatePedidoInternoDto {
  @IsString()
  @IsNotEmpty()
  areaId: string;

  @IsString()
  @IsNotEmpty()
  almacenId: string;

  @IsOptional()
  @IsDateString()
  fechaRequerida?: string;

  @IsOptional()
  @IsIn(['NORMAL', 'URGENTE', 'CRITICO'])
  prioridad?: 'NORMAL' | 'URGENTE' | 'CRITICO';

  @IsOptional()
  @IsString()
  notasSolicitud?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'El pedido debe tener al menos un ítem' })
  @ValidateNested({ each: true })
  @Type(() => CreatePedidoInternoItemDto)
  items: CreatePedidoInternoItemDto[];
}
