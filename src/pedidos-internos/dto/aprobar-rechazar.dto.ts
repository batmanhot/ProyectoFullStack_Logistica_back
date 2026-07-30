import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AprobarPedidoDto {
  @IsOptional()
  @IsString()
  notas?: string;
}

export class RechazarPedidoDto {
  @IsString()
  @IsNotEmpty({ message: 'El motivo del rechazo es obligatorio' })
  motivo: string;
}
