import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ConfirmarLineaPickingDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cantidad: number;

  /** Ubicación real de la que se tomó — si no se envía, se conserva la sugerida. */
  @IsOptional()
  @IsString()
  ubicacionId?: string;
}
