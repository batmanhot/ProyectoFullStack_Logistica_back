import { IsString, IsOptional, IsNumber, IsDateString, MinLength, Min } from 'class-validator';

// No extiende CreateOportunidadDto a propósito: clienteId NO es editable acá
// (cambiar de cliente a una oportunidad ya iniciada es, en la práctica, otra
// oportunidad — se crea una nueva). Todos los demás campos son opcionales.
export class UpdateOportunidadDto {
  @IsOptional()
  @IsString()
  contacto?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  descripcion?: string;

  @IsOptional()
  @IsString()
  necesidad?: string;

  @IsOptional()
  @IsString()
  responsableId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valorEstimado?: number;

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
