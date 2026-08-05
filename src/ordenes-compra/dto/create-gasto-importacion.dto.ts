import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { TipoGastoImportacion } from '@prisma/client';

export class CreateGastoImportacionDto {
  @IsEnum(TipoGastoImportacion)
  tipo: TipoGastoImportacion;

  @IsNumber()
  @Min(0.01, { message: 'El monto del gasto debe ser mayor a cero' })
  monto: number;

  @IsOptional()
  @IsString()
  moneda?: string;

  @IsOptional()
  @IsString()
  notas?: string;
}
