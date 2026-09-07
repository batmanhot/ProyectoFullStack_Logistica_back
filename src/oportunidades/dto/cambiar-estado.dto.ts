import { IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';
import { EstadoOportunidad } from '@prisma/client';

export class CambiarEstadoOportunidadDto {
  @IsEnum(EstadoOportunidad)
  estado: EstadoOportunidad;

  // Obligatorio solo si estado === PERDIDA (ver validación adicional en el
  // service — @ValidateIf cubre el caso normal, pero motivoPerdida vacío
  // ('') pasaría @ValidateIf, por eso el service revalida).
  @ValidateIf((o) => o.estado === 'PERDIDA')
  @IsString()
  motivoPerdida?: string;
}
