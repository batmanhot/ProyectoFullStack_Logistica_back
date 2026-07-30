import { IsBoolean, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class UpdateListaPreciosDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  tipo?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  descuento?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  markup?: number;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;

  @IsOptional()
  @IsObject()
  precios?: Record<string, number>;
}
