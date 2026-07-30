import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class MarcarParadaDto {
  @IsIn(['EN_CAMINO', 'ENTREGADO', 'FALLIDO'])
  @IsNotEmpty()
  estado: 'EN_CAMINO' | 'ENTREGADO' | 'FALLIDO';

  @IsOptional()
  @IsString()
  observacion?: string;
}
