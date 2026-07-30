import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateProductoDto {
  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsString()
  @IsNotEmpty()
  nombre: string;

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

  // Extensión por analogía con la regla "precioVenta no puede ser negativo"
  // (sección 5) — el documento no define precioCompra explícitamente.
  @IsOptional()
  @IsNumber()
  @Min(0)
  precioCompra?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precioVenta?: number;
}
