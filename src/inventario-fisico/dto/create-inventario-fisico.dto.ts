import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateInventarioFisicoDto {
  /** Obligatorio (decisión de Fase 6) — el conteo siempre es de UN almacén. */
  @IsString()
  @IsNotEmpty()
  almacenId: string;

  @IsOptional()
  @IsString()
  categoriaId?: string;

  @IsOptional()
  @IsString()
  notas?: string;
}
