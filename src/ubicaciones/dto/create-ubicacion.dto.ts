import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateUbicacionDto {
  @IsString()
  @IsNotEmpty()
  almacenId: string;

  @IsString()
  @IsNotEmpty()
  codigo: string;

  @IsString()
  @IsNotEmpty()
  tipo: string; // Estantería | Rack | Piso

  @IsString()
  @IsNotEmpty()
  zona: string; // Picking | Reserva | Cuarentena

  @IsInt()
  @Min(1)
  capacidadMax: number;

  @IsOptional()
  @IsString()
  observaciones?: string;
}
