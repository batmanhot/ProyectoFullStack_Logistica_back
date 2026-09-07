import { IsDateString, IsIn, IsOptional, IsString, ValidateIf } from 'class-validator';

/** Solo aplicable mientras el pedido está en BORRADOR. */
export class UpdatePedidoInternoDto {
  @IsOptional()
  @IsDateString()
  fechaRequerida?: string;

  @IsOptional()
  @IsIn(['NORMAL', 'URGENTE', 'CRITICO'])
  prioridad?: 'NORMAL' | 'URGENTE' | 'CRITICO';

  @IsOptional()
  @IsString()
  notasSolicitud?: string;

  // Acepta `null` explícito para poder quitar un proyecto ya asignado
  // mientras el pedido sigue en BORRADOR (mismo patrón que
  // Usuario.metaVentasMensual — ver update-usuario.dto.ts).
  @IsOptional()
  @ValidateIf((o) => o.proyectoId !== null)
  @IsString()
  proyectoId?: string | null;
}
