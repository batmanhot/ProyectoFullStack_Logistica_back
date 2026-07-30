import { IsDateString, IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateNegocioDto {
  /** Slug único usado en el login por tenant (paso 1) — siempre minúscula. */
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, { message: 'codigo solo puede tener minúsculas, números y guiones' })
  codigo: string;

  @IsString()
  @IsNotEmpty()
  nombre: string;

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

  @IsOptional()
  @IsString()
  notas?: string;

  // ── Usuario administrador inicial del nuevo negocio ──
  // La contraseña se usa UNA SOLA VEZ aquí, hasheada con bcrypt — nunca
  // se almacena ni se devuelve en texto plano (decisión de seguridad de
  // Fase 7d, no negociable).
  @IsString()
  @IsNotEmpty()
  adminNombre: string;

  @IsEmail()
  adminEmail: string;

  @IsString()
  @MinLength(8)
  adminPassword: string;
}
