import { ArrayNotEmpty, IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateAdminRolDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permisos?: string[];
}
