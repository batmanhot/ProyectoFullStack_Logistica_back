import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateAreaInternaDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  codigo?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
