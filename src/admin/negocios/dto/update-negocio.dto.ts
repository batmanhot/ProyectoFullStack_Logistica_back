import { IsBoolean, IsDateString, IsEmail, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class UpdateNegocioDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  nombreCorto?: string;

  @IsOptional()
  @Matches(/^\d{8,11}$/, { message: 'El RUC debe tener entre 8 y 11 dígitos numéricos' })
  ruc?: string;

  @IsOptional()
  @IsString()
  contacto?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @IsIn(['trial', 'activo', 'suspendido', 'cancelado'])
  estado?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  // ── Administrador del Negocio (rol 'admin') ──
  @IsOptional() @IsString() adminNombre?: string;
  @IsOptional() @IsEmail() adminEmail?: string;
  @IsOptional() @IsString() @MinLength(8) adminPassword?: string;
  @IsOptional() @IsString() adminTelefono?: string;
  @IsOptional() @IsString() adminDocumento?: string;
  @IsOptional() @IsString() adminCargo?: string;
  @IsOptional() @IsBoolean() adminActivo?: boolean;

  // ── Propietario / Admin Owner (rol 'owner') ──
  @IsOptional() @IsString() ownerNombre?: string;
  @IsOptional() @IsEmail() ownerEmail?: string;
  @IsOptional() @IsString() @MinLength(8) ownerPassword?: string;
  @IsOptional() @IsString() ownerTelefono?: string;
  @IsOptional() @IsString() ownerDocumento?: string;
  @IsOptional() @IsString() ownerCargo?: string;
  @IsOptional() @IsBoolean() ownerActivo?: boolean;
}
