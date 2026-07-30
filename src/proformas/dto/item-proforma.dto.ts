import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ItemProformaDto {
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
