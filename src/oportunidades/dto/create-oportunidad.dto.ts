import { IsString, IsOptional, IsNumber, IsDateString, MinLength, Min } from 'class-validator';

export class CreateOportunidadDto {
  @IsString()
  clienteId: string;

  @IsOptional()
  @IsString()
  contacto?: string;

  @IsString()
  @MinLength(3)
  descripcion: string;

  @IsOptional()
  @IsString()
  necesidad?: string;

  @IsString()
  responsableId: string;

  @IsNumber()
  @Min(0)
  valorEstimado: number;

  @IsOptional()
  @IsString()
  fuente?: string;

  @IsOptional()
  @IsDateString()
  fechaEstimadaCierre?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;
}
