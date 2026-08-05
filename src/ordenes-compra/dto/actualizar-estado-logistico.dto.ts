import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { EstadoLogisticoImportacion } from '@prisma/client';

export class ActualizarEstadoLogisticoDto {
  @IsEnum(EstadoLogisticoImportacion)
  estadoLogistico: EstadoLogisticoImportacion;

  /**
   * Tipo de cambio del día de nacionalización — obligatorio para pasar a
   * NACIONALIZADA si la OC no lo trae ya cargado desde su creación (ver
   * OrdenesCompraService.actualizarEstadoLogistico).
   */
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  tipoCambio?: number;
}
