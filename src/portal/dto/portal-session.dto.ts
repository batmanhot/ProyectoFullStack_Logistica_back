import { IsJWT } from 'class-validator';

/** Body de POST /api/portal/session — canjea el token de link por cookie httpOnly. */
export class PortalSessionDto {
  @IsJWT()
  token!: string;
}
