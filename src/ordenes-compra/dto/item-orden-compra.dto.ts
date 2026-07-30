import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class ItemOrdenCompraDto {
  @IsString()
  @IsNotEmpty()
  productoId: string;

  @IsNumber()
  @Min(0.01)
  cantidad: number;

  @IsNumber()
  @Min(0)
  costoUnitario: number;
}
