import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateCategoriaDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  /** Permite reactivar (PUT con estado: 'Activo') sin pasar por DELETE/restore separados. */
  @IsOptional()
  @IsIn(['Activo', 'Inactivo'])
  estado?: string;
}
