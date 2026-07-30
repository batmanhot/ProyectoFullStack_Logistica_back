import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateProductoDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  categoriaId?: string;

  @IsOptional()
  @IsString()
  proveedorId?: string;

  @IsOptional()
  @IsString()
  unidadMedida?: string;

  @IsOptional()
  @IsBoolean()
  esPerecedero?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stockMinimo?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stockMaximo?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precioCompra?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precioVenta?: number;

  /** stockActual NUNCA se expone aquí — solo lo cambian los Movimientos. */
  @IsOptional()
  @IsIn(['Activo', 'Inactivo'])
  estado?: string;
}
