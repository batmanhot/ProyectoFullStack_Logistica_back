import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateRolDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permisos?: string[];
}
