import { ArrayMinSize, IsArray, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateRutaDto {
  @IsString()
  @IsNotEmpty()
  transportistaId: string;

  @IsDateString()
  fechaSalida: string;

  @IsOptional()
  @IsString()
  almacenId?: string;

  @IsOptional()
  @IsNumber()
  costoViaje?: number;

  /** Deben estar en estado LISTO — se re-valida al iniciar la ruta. */
  @IsArray()
  @ArrayMinSize(1, { message: 'La ruta debe incluir al menos un despacho' })
  @IsString({ each: true })
  despachoIds: string[];
}
