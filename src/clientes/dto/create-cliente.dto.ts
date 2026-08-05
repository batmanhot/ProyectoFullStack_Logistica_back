import { Type } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreateClienteDto {
  @IsString()
  @IsNotEmpty()
  razonSocial: string;

  // Misma regla que Proveedor/Cliente en validators.js del frontend.
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
  @IsString()
  listaPrecioId?: string;
}
