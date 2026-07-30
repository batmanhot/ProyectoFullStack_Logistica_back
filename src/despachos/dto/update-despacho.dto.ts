import { IsDateString, IsOptional, IsString } from 'class-validator';

/** Solo campos editables ANTES de DESPACHADO — items/montos no se editan, se cancela y rehace. */
export class UpdateDespachoDto {
  @IsOptional()
  @IsDateString()
  fechaEntrega?: string;

  @IsOptional()
  @IsString()
  direccionEntrega?: string;

  @IsOptional()
  @IsString()
  transportistaId?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;
}
