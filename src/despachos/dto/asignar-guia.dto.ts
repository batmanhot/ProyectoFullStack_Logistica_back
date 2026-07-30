import { IsNotEmpty, IsString } from 'class-validator';

export class AsignarGuiaDto {
  @IsString()
  @IsNotEmpty()
  guiaNumero: string;
}
