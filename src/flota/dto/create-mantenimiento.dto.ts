import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateMantenimientoDto {
  @IsString()
  @IsNotEmpty()
  tipo: string; // Cambio de aceite | Afinamiento | Revisión frenos | ...

  @IsOptional()
  @IsDateString()
  fecha?: string;

  // Extensión de Fase 7a: no puede ser menor al kmActual ya registrado del
  // vehículo (el código real no validaba esto, pero un kilometraje no
  // debería retroceder — misma lógica que stockMinimo<=stockMaximo en otras fases).
  @IsOptional()
  @IsNumber()
  @Min(0)
  kmActual?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costo?: number;

  @IsOptional()
  @IsString()
  taller?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;

  // Sin esto, registrar un mantenimiento nunca cerraba la alerta que lo
  // motivó — proxMantenimiento se quedaba con la fecha vieja para siempre.
  @IsOptional()
  @IsDateString()
  proximoMantenimiento?: string;
}
