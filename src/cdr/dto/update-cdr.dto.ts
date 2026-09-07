import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateCdrDto {
  @IsOptional()
  @IsString()
  codigo?: string;

  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  responsable?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
