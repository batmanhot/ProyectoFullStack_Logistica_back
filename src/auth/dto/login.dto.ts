import { IsNotEmpty, IsString } from 'class-validator';

/** Paso 2 del login (sección 6.3) — empresaId viene de la respuesta del paso 1. */
export class LoginDto {
  @IsString()
  @IsNotEmpty()
  empresaId: string;

  @IsString()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
