import { IsIn, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

export class MarcarParadaDto {
  @IsIn(['EN_CAMINO', 'ENTREGADO', 'FALLIDO'])
  @IsNotEmpty()
  estado: 'EN_CAMINO' | 'ENTREGADO' | 'FALLIDO';

  @IsOptional()
  @IsString()
  observacion?: string;

  // Evidencia de entrega — mismos campos que EntregarDto (Despachos) y misma
  // exigencia: obligatorios solo cuando se confirma ENTREGADO (no aplica a
  // EN_CAMINO/FALLIDO). Se reenvían tal cual a entregarEnTransaccion().
  @ValidateIf((o) => o.estado === 'ENTREGADO')
  @IsString()
  @IsNotEmpty()
  receptorNombre?: string;

  @ValidateIf((o) => o.estado === 'ENTREGADO')
  @IsString()
  @IsNotEmpty()
  evidenciaFoto?: string;

  @IsOptional()
  @IsString()
  evidenciaNotas?: string;
}
