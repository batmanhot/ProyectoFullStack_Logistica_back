import { IsNotEmpty, IsString } from 'class-validator';

/** "Eliminar definitivamente" — exige re-escribir el nombre exacto del negocio como confirmación. */
export class ArchivarNegocioDto {
  @IsString()
  @IsNotEmpty()
  confirmacionNombre: string;
}
