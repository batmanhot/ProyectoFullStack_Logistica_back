import { IsNotEmpty, IsString } from 'class-validator';

export class CreateAlmacenDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;
}
