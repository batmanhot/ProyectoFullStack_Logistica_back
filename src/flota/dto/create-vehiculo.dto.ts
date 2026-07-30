import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

// Los inputs <input type="date"> del frontend envían '' cuando están vacíos —
// @IsOptional() de class-validator solo omite la validación en null/undefined,
// no en string vacío, así que hay que normalizar '' -> undefined ANTES de validar.
const vacioAUndefined = ({ value }: { value: unknown }) => (value === '' ? undefined : value);

export class CreateVehiculoDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsNotEmpty()
  tipo: string; // Camioneta | Camión | Furgón | Moto | Auto | Bus | Otro

  @IsString()
  @IsNotEmpty()
  placa: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  anio?: number;

  @IsOptional()
  @IsString()
  conductor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  kmActual?: number;

  @IsOptional()
  @Transform(vacioAUndefined)
  @IsDateString()
  vencSoat?: string;

  @IsOptional()
  @Transform(vacioAUndefined)
  @IsDateString()
  vencRevTecnica?: string;

  @IsOptional()
  @Transform(vacioAUndefined)
  @IsDateString()
  proxMantenimiento?: string;

  @IsOptional()
  @IsString()
  transportistaId?: string;
}
