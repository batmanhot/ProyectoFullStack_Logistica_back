import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString } from 'class-validator';

/** Crea un rol PERSONALIZADO para el tenant actual (esPersonalizado=true). */
export class CreateRolDto {
  @IsString()
  @IsNotEmpty()
  codigo: string;

  @IsString()
  @IsNotEmpty()
  label: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permisos: string[]; // nombres de módulo, o '*' para acceso total
}
