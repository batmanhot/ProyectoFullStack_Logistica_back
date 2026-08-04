import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolverIncidenciaDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notaResolucion?: string;
}
