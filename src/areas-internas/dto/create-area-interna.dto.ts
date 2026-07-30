import { IsNotEmpty, IsString } from 'class-validator';

export class CreateAreaInternaDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsNotEmpty()
  codigo: string;
}
