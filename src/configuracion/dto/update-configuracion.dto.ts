import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateConfiguracionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  ruc?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  direccion?: string;

  /** Switch de Configuración → Sistema. Solo tiene efecto visible si origen='demo'. */
  @IsOptional()
  @IsBoolean()
  modoDesarrollo?: boolean;

  /** Método de valorización de inventario (Configuración → Valorización). Aplicado en el Kardex valorizado. */
  @IsOptional()
  @IsIn(['PMP', 'FIFO', 'LIFO'])
  formulaValorizacion?: string;

  /** Configuración → Alertas. Si es false, no se generan alertas de vencimiento. */
  @IsOptional()
  @IsBoolean()
  alertaVencimiento?: boolean;
}
