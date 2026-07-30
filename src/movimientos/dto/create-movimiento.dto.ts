import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import { TipoMovimiento } from '@prisma/client';

export class CreateMovimientoDto {
  @IsEnum(TipoMovimiento)
  tipo: TipoMovimiento;

  @IsString()
  @IsNotEmpty()
  productoId: string;

  @IsOptional()
  @IsString()
  loteId?: string;

  @IsString()
  @IsNotEmpty()
  almacenId: string;

  /** Obligatorio solo cuando tipo=TRANSFERENCIA (regla "Transferencia", sección 5). */
  @ValidateIf((dto) => dto.tipo === TipoMovimiento.TRANSFERENCIA)
  @IsString()
  @IsNotEmpty({ message: 'almacenDestinoId es obligatorio cuando tipo=TRANSFERENCIA' })
  almacenDestinoId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01, { message: 'cantidad debe ser mayor a cero' })
  cantidad: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costoUnitario?: number;

  /**
   * Obligatorio solo cuando tipo=AJUSTE — decide si el ajuste suma o resta
   * stock (decisión de Fase 3: el enum TipoMovimiento no distingue sentido
   * para este caso, a diferencia de ENTRADA/SALIDA/TRANSFERENCIA/DEVOLUCION).
   */
  @ValidateIf((dto) => dto.tipo === TipoMovimiento.AJUSTE)
  @IsIn(['incremento', 'decremento'], {
    message: "direccion debe ser 'incremento' o 'decremento' cuando tipo=AJUSTE",
  })
  direccion?: 'incremento' | 'decremento';

  @IsOptional()
  @IsString()
  motivo?: string;

  @IsOptional()
  @IsString()
  documento?: string;
}
