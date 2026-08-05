import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ConvertirDespachoDto {
  /** Obligatorio — mismo criterio que AprobarPedidoPortalDto: no hay fallback ingenuo a almacenes[0]. */
  @IsString()
  @IsNotEmpty()
  almacenId: string;

  @IsOptional()
  @IsString()
  transportistaId?: string;

  @IsOptional()
  @IsString()
  direccionEntrega?: string;
}
