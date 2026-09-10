import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class ActualizarReglaAprobacionDto {
  /**
   * Códigos de rol que pueden ejecutar la aprobación del proceso.
   * [] = sin aprobador designado (basta el permiso de módulo).
   * 'owner' / 'admin' se ignoran: aprueban siempre.
   */
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  rolesAprobadores: string[];
}
