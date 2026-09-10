import { IsJWT } from 'class-validator';

/** Body de POST /api/portal-proveedor/session — canjea el token de link por cookie httpOnly. */
export class PortalProveedorSessionDto {
  @IsJWT()
  token!: string;
}
