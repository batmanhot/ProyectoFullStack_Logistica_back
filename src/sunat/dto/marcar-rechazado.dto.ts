import { IsNotEmpty, IsString } from 'class-validator';

export class MarcarRechazadoDto {
  @IsString()
  @IsNotEmpty({ message: 'El motivo del rechazo es obligatorio' })
  motivo: string;
}
