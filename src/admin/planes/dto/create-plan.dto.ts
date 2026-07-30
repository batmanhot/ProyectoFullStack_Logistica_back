import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

// Mismo vocabulario que Permiso.modulo (ver informe de roles/planes) — 9 grupos funcionales.
export const MODULOS_VALIDOS = [
  'inventario', 'operaciones', 'compras', 'despachos', 'transporte',
  'ventas', 'contable', 'portal-b2b', 'reportes', 'panel-auditoria',
] as const;

export class CreatePlanDto {
  /** Slug único del plan — usado como referencia libre desde Empresa.plan. */
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, { message: 'id solo puede tener minúsculas, números y guiones' })
  id: string;

  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precioMensual?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precioAnual?: number;

  @IsOptional()
  @IsString()
  moneda?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsBoolean()
  destacado?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  vigenciaDias?: number;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  caracteristicas?: string[];

  // ── Límites (solo configuración — sin enforcement, decisión de Fase 7d) ──
  @IsOptional()
  @IsInt()
  maxUsuarios?: number; // -1 = ilimitado

  @IsOptional()
  @IsInt()
  maxProductos?: number;

  @IsOptional()
  @IsInt()
  maxAlmacenes?: number;

  @IsOptional()
  @IsInt()
  maxProveedores?: number;

  @IsOptional()
  @IsInt()
  maxClientes?: number;

  @IsOptional()
  @IsInt()
  maxOrdenesMes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  almacenamientoGB?: number;

  @IsOptional()
  @IsIn(['email', 'prioritario', '24/7'])
  soporte?: string;

  @IsOptional()
  @IsBoolean()
  apiAccess?: boolean;

  @IsOptional()
  @IsBoolean()
  multiEmpresa?: boolean;

  @IsOptional()
  @IsBoolean()
  exportAvanzada?: boolean;

  @IsOptional()
  @IsBoolean()
  reportesAvanzados?: boolean;

  // ── Alcance funcional (eje de "tipo de negocio") ──
  @IsOptional()
  @IsArray()
  @IsIn(MODULOS_VALIDOS, { each: true })
  modulosIncluidos?: string[];

  @IsOptional()
  @IsBoolean()
  esPublico?: boolean;
}
