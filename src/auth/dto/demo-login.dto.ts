import { IsNotEmpty, IsString } from 'class-validator';

/** Acceso rápido de "modo desarrollo" — sin password, ver AuthService.demoLogin. */
export class DemoLoginDto {
  @IsString()
  @IsNotEmpty()
  empresaId: string;

  @IsString()
  @IsNotEmpty()
  usuarioId: string;
}
