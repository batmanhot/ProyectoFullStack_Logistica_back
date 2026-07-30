import { ArrayNotEmpty, IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateReglaAlertaDto {
  @IsInt()
  @Min(0)
  diasAntes: number;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  canales: string[]; // email | sistema | whatsapp | sms

  @IsString()
  @IsNotEmpty()
  asunto: string;

  @IsString()
  @IsNotEmpty()
  mensaje: string;
}
