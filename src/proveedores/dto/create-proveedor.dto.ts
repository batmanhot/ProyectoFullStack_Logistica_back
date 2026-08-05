import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreateProveedorDto {
  @IsString()
  @IsNotEmpty()
  razonSocial: string;

  // Extensión por analogía con la regla de RUC de Cliente (sección 5) —
  // el documento no define una regla explícita para Proveedor, pero el
  // formato peruano de RUC es el mismo independientemente de la entidad.
  @IsOptional()
  @Matches(/^\d{8,11}$/, { message: 'El RUC debe tener entre 8 y 11 dígitos numéricos' })
  ruc?: string;

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
  paisOrigen?: string;

  @IsOptional()
  @IsString()
  monedaNegociacion?: string;
}
