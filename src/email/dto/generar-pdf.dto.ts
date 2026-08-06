import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GenerarPdfDto {
  @IsString()
  @IsNotEmpty()
  html: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  numeroDocumento: string;
}
