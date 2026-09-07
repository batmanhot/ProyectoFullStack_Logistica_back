import { IsEnum, IsString, IsOptional, IsDateString, MinLength } from 'class-validator';
import { TipoActividadComercial } from '@prisma/client';

export class RegistrarActividadDto {
  @IsEnum(TipoActividadComercial)
  tipo: TipoActividadComercial;

  @IsString()
  @MinLength(2)
  resultado: string;

  @IsOptional()
  @IsString()
  comentarios?: string;

  // Si vienen informados, se reflejan también en Oportunidad.proximaAccion /
  // fechaProximaAccion (ver OportunidadesService.registrarActividad) — es la
  // "tarea" implícita de la oportunidad, sin necesidad de una tabla aparte.
  @IsOptional()
  @IsString()
  proximaAccion?: string;

  @IsOptional()
  @IsDateString()
  fechaProximaAccion?: string;
}
