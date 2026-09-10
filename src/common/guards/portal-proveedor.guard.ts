import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { RT_COOKIE } from '../utils/auth-cookies';

export interface PortalProveedorPayload {
  sub: string; // proveedorId
  empresaId: string;
  scope: 'portal_proveedor';
  proveedorNombre?: string;
  tokenVersion?: number;
}

/**
 * Verifica un token de Portal de Proveedores: firma (PORTAL_JWT_SECRET), scope y
 * revocación (Proveedor.portalTokenVersion). Lo comparten el guard y el endpoint
 * de canje por cookie (`POST /api/portal-proveedor/session`).
 */
export async function verificarTokenPortalProveedor(
  jwt: JwtService,
  prisma: PrismaService,
  token: string,
): Promise<PortalProveedorPayload> {
  let payload: PortalProveedorPayload;
  try {
    payload = await jwt.verifyAsync<PortalProveedorPayload>(token, {
      secret: process.env.PORTAL_JWT_SECRET,
    });
    if (payload.scope !== 'portal_proveedor') {
      throw new UnauthorizedException('Token de portal inválido');
    }
  } catch {
    throw new UnauthorizedException('Token de portal inválido o expirado');
  }

  // Proveedor tiene RLS por tenant (ver Hallazgo Crítico #1) — sin withTenant()
  // esta consulta no vería la fila y el portal quedaría roto para todos.
  // empresaId viene del payload ya verificado (firma válida), no del cliente.
  const proveedor = await prisma.withTenant(payload.empresaId, (tx) =>
    tx.proveedor.findUnique({
      where: { id: payload.sub },
      select: { portalTokenVersion: true },
    }),
  );
  if (!proveedor || (payload.tokenVersion ?? 0) !== proveedor.portalTokenVersion) {
    throw new UnauthorizedException('Token de portal revocado — solicita un nuevo link');
  }
  return payload;
}

/**
 * Cuarta identidad de auth del backend (después de Usuario, PlatformAdmin
 * y Cliente) — Portal de Proveedores B2B. Mismo patrón que
 * PortalClienteGuard: JWT firmado con PORTAL_JWT_SECRET, pero con
 * scope 'portal_proveedor' para que un token de cliente nunca sirva
 * para entrar como proveedor ni viceversa.
 *
 * Las rutas /api/portal-proveedor/* llevan @Public() (bypass del guard
 * de tenant) Y @UseGuards(PortalProveedorGuard).
 *
 * Hallazgo Alto #10 (auditoría 2026-07-29): ver el comentario equivalente
 * en PortalClienteGuard — revocación vía Proveedor.portalTokenVersion y
 * ya no se acepta el token por query string.
 */
@Injectable()
export class PortalProveedorGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Token de portal no provisto');
    }
    request.portalProveedor = await verificarTokenPortalProveedor(
      this.jwtService,
      this.prisma,
      token,
    );
    return true;
  }

  private extractToken(request: any): string | undefined {
    // Preferencia: cookie httpOnly `sp_portal_prov_rt` (canjeada en
    // POST /portal-proveedor/session). Fallback: header Bearer (rollout).
    const fromCookie: string | undefined = request.cookies?.[RT_COOKIE.portalProveedor.nombre];
    if (fromCookie) return fromCookie;
    const authHeader: string | undefined = request.headers?.authorization;
    if (!authHeader) return undefined;
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
