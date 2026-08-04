import { IsNotEmpty, IsString } from 'class-validator';

export class AsignarPickingDto {
  @IsString()
  @IsNotEmpty()
  usuarioId: string;
}
