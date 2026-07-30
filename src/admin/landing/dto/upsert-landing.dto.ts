import { IsNotEmpty, IsObject } from 'class-validator';

/** Contenido de marketing puro — sin validar la forma interna (sitio, hero, etc.). */
export class UpsertLandingDto {
  @IsObject()
  @IsNotEmpty()
  data: Record<string, unknown>;
}
