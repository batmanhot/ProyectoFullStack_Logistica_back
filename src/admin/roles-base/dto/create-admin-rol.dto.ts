import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString, Matches } from 'class-validator';

/** Crea un rol del CATÁLOGO BASE (empresaId null) — plantilla heredable por todos los tenants. */
export class CreateAdminRolDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, { message: 'codigo solo puede tener minúsculas, números y guiones' })
  codigo: string;

  @IsString()
  @IsNotEmpty()
  label: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permisos: string[]; // nombres de módulo (ver MODULOS_GRUPOS del frontend), o '*' para acceso total
}
