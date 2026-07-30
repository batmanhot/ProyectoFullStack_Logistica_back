import { IsNumber, IsOptional, Min } from 'class-validator';

export class CompletarRutaDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  kmRecorrido?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costoViaje?: number;
}
