import { ArrayNotEmpty, IsArray, IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateReglaAlertaDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  diasAntes?: number;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  canales?: string[];

  @IsOptional()
  @IsString()
  asunto?: string;

  @IsOptional()
  @IsString()
  mensaje?: string;
}
