import { IsNotEmpty, IsString } from 'class-validator';

export class RechazarPedidoPortalDto {
  @IsString()
  @IsNotEmpty({ message: 'El motivo del rechazo es obligatorio' })
  motivo: string;
}
