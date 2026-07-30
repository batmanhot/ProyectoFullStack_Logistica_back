import { IsOptional, IsString } from 'class-validator';

export class MarcarAceptadoDto {
  @IsOptional()
  @IsString()
  cdr?: string; // comprobante digital de recepción (cuando exista integración real con un OSE)
}
