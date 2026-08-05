import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

export class UpdateClienteDto {
  @IsOptional()
  @IsString()
  razonSocial?: string;

  @IsOptional()
  @Matches(/^\d{8,11}$/, { message: 'El RUC debe tener entre 8 y 11 dígitos numéricos' })
  ruc?: string;

  @IsOptional()
  @IsString()
  contacto?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsString()
  condicionPago?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  limiteCredito?: number;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  /** `null` desasigna la lista de precios del cliente. */
  @IsOptional()
  @IsString()
  listaPrecioId?: string | null;
}
