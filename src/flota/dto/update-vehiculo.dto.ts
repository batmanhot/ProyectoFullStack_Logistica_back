import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

// Los inputs <input type="date"> del frontend envían '' cuando están vacíos —
// @IsOptional() de class-validator solo omite la validación en null/undefined,
// no en string vacío, así que hay que normalizar '' -> undefined ANTES de validar.
const vacioAUndefined = ({ value }: { value: unknown }) => (value === '' ? undefined : value);

export class UpdateVehiculoDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  tipo?: string;

  @IsOptional()
  @IsString()
  placa?: string;

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

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
