import { IsDateString, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateNegocioDto {
  /** Slug único usado en el login por tenant (paso 1) — siempre minúscula. */
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, { message: 'codigo solo puede tener minúsculas, números y guiones' })
  codigo: string;

  @IsString()
  @IsNotEmpty()
  nombre: string;

  /** Nombre corto para mostrar en el sidebar cuando el nombre completo es muy largo. */
  @IsOptional()
  @IsString()
  nombreCorto?: string;

  @Matches(/^\d{8,11}$/, { message: 'El RUC debe tener entre 8 y 11 dígitos numéricos' })
  ruc: string;

  @IsOptional()
  @IsString()
  contacto?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  /** Referencia libre a PlanSaaS.id — se valida que exista si se envía. */
  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  /** Si se omite, Empresa.estado cae al default de schema ("activo"). */
  @IsOptional()
  @IsIn(['trial', 'activo'])
  estado?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  // ── Usuario Propietario / Admin Owner del negocio (rol 'owner') — OBLIGATORIO ──
  // docs/GOBIERNO-PLATAFORMA.md regla 3: todo negocio nace con al menos un
  // Propietario. La contraseña se usa UNA SOLA VEZ acá, hasheada con bcrypt —
  // nunca se almacena ni se devuelve en texto plano.
  @IsString()
  @IsNotEmpty()
  ownerNombre: string;

  @IsEmail()
  ownerEmail: string;

  @IsString()
  @MinLength(8)
  ownerPassword: string;

  // Datos de perfil del Propietario (opcionales)
  @IsOptional() @IsString() ownerTelefono?: string;
  @IsOptional() @IsString() ownerDocumento?: string;
  @IsOptional() @IsString() ownerCargo?: string;

  // ── Administrador del Negocio / Admin Tenant (rol 'admin') — OPCIONAL ──
  // El segundo (y último) usuario de gobierno del negocio. Si se envía uno de
  // los 3 campos, se exigen los 3.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  adminNombre?: string;

  @IsOptional()
  @IsEmail()
  adminEmail?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  adminPassword?: string;

  // Datos de perfil del Administrador del Negocio (opcionales)
  @IsOptional() @IsString() adminTelefono?: string;
  @IsOptional() @IsString() adminDocumento?: string;
  @IsOptional() @IsString() adminCargo?: string;
}
