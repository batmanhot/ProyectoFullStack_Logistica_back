import { IsBoolean } from 'class-validator';

export class UpdatePlataformaConfigDto {
  /** SuperAdmin → Ajustes: mostrar tarjetas de acceso rápido en el Login para todos los negocios. */
  @IsBoolean()
  accesoRapidoTarjetas: boolean;
}
