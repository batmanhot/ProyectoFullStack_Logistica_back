import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateAlmacenDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  /** Permite reactivar (PUT con activo: true) sin un endpoint de restore separado. */
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
