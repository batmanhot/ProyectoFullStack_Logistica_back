import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class ReubicarDto {
  @IsString()
  @IsNotEmpty()
  productoId: string;

  @IsNumber()
  @Min(0.01)
  cantidad: number;
}
