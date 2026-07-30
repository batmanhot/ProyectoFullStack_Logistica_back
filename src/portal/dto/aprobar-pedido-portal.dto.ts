import { IsNotEmpty, IsString } from 'class-validator';

export class AprobarPedidoPortalDto {
  /** Obligatorio — no se replica el fallback ingenuo `almacenes[0]` del frontend viejo. */
  @IsString()
  @IsNotEmpty()
  almacenId: string;
}
