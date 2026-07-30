import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface PortalClientePayload {
  sub: string; // clienteId
  empresaId: string;
  scope: 'portal_cliente';
  clienteNombre?: string;
  tokenVersion?: number;
}

/**
 * Tercera identidad de auth del backend (después de Usuario y
 * PlatformAdmin) — Fase 7e. Verifica el JWT del Portal de Clientes
 * contra su PROPIO secreto (PORTAL_JWT_SECRET). Reemplaza el token
 * inseguro del frontend viejo (btoa(clienteId:ruc), sin firma).
 *
 * Las rutas /api/portal/* llevan @Public() (bypass del guard de tenant)
 * Y @UseGuards(PortalClienteGuard). Nunca se mezcla con Usuario ni
 * PlatformAdmin — un Cliente no tiene credenciales de Usuario.
 *
 * Hallazgo Alto #10 (auditoría 2026-07-29): estos tokens duran 365 días.
 * Antes no había forma de revocar un link filtrado antes de que expirara
 * solo — ahora se valida contra Cliente.portalTokenVersion (incrementado al
 * regenerar el link), y ya no se acepta el token por query string (el
 * frontend real siempre lo manda por header — ver front/logistica/src/
 * services/api.js — el fallback por query solo ampliaba la superficie de
 * exposición vía logs de servidor/historial del navegador/Referer).
 */
@Injectable()
export class PortalClienteGuard implements CanActivate {
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

    let payload: PortalClientePayload;
    try {
      payload = await this.jwtService.verifyAsync<PortalClientePayload>(token, {
        secret: process.env.PORTAL_JWT_SECRET,
      });
      if (payload.scope !== 'portal_cliente') {
        throw new UnauthorizedException('Token de portal inválido');
      }
    } catch {
      throw new UnauthorizedException('Token de portal inválido o expirado');
    }

    // Cliente tiene RLS por tenant (ver Hallazgo Crítico #1) — sin withTenant()
    // esta consulta no vería la fila y el portal quedaría roto para todos.
    // empresaId viene del payload ya verificado (firma válida), no del cliente.
    const cliente = await this.prisma.withTenant(payload.empresaId, (tx) =>
      tx.cliente.findUnique({
        where: { id: payload.sub },
        select: { portalTokenVersion: true },
      }),
    );
    if (!cliente || (payload.tokenVersion ?? 0) !== cliente.portalTokenVersion) {
      throw new UnauthorizedException('Token de portal revocado — solicita un nuevo link');
    }

    request.portalCliente = payload;
    return true;
  }

  private extractToken(request: any): string | undefined {
    const authHeader: string | undefined = request.headers?.authorization;
    if (!authHeader) return undefined;
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
