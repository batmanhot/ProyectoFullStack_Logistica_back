import { IsNumber, Min } from 'class-validator';

export class ActualizarLineaDto {
  @IsNumber()
  @Min(0, { message: 'El stock físico contado no puede ser negativo' })
  stockFisico: number;
}
