import { IsString, Matches } from 'class-validator';

/**
 * Body de POST /api/auth/refresh. El refresh token NO viaja acá (va en la
 * cookie httpOnly `sp_rt_<empresaId>`), pero sí hace falta que la pestaña diga
 * a qué empresa pertenece su sesión: hay una cookie de refresh por negocio y el
 * backend tiene que leer la correcta.
 */
export class RefreshDto {
  @IsString()
  @Matches(/^[a-z0-9]+$/i, { message: 'empresaId inválido' })
  empresaId!: string;
}
