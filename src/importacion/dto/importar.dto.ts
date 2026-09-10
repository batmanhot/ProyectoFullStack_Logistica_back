import { ArrayMaxSize, ArrayNotEmpty, IsArray } from 'class-validator';

export class ImportarDto {
  /** Filas del Excel ya parseadas por el cliente: [{ "Razón Social": "...", "RUC": "..." }, ...] */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(5000, { message: 'Máximo 5000 filas por importación.' })
  filas: Record<string, unknown>[];
}
