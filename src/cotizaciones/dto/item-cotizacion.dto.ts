import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ItemCotizacionDto {
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
