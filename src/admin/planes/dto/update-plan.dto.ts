import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { MODULOS_VALIDOS } from './create-plan.dto';

/** id (slug) nunca se edita — se crea uno nuevo si hace falta cambiarlo. */
export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  nombre?: string;

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
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  vigenciaDias?: number;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  caracteristicas?: string[];

  @IsOptional()
  @IsInt()
  maxUsuarios?: number;

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
