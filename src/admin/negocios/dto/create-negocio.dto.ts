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

  // ── Usuario administrador inicial del nuevo negocio (rol 'admin') ──
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

  // ── Admin Owner opcional (regla de gobierno 2026-09-04: "hasta dos
  // Administradores del Sistema — Owner y Tenant Admin, mínimo un Owner") ──
  // Campos nuevos y opcionales a propósito: el panel clásico (AdminSaaS/)
  // nunca los envía y sigue creando solo el usuario 'admin' de siempre, sin
  // cambio de comportamiento. El panel V2 (AdminSaaSV2/) sí los completa,
  // creando además un segundo usuario con rol 'owner'.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  ownerNombre?: string;

  @IsOptional()
  @IsEmail()
  ownerEmail?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  ownerPassword?: string;
}
