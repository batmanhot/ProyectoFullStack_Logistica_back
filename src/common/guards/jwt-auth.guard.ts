import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { TtlCache } from '../utils/ttl-cache';

export interface JwtPayload {
  sub: string; // usuarioId
  empresaId: string;
  email: string;
  rolId: string;
  tokenVersion?: number; // presente en tokens emitidos desde 2026-09-10 (revocación)
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  // Estado de cuenta cacheado ~30 s (activo + tokenVersion). Revocar (desactivar
  // usuario / logout) surte efecto al vencer el TTL, no a los 15 min del token.
  private readonly estadoCuenta = new TtlCache<{ activo: boolean; tokenVersion: number } | null>(30_000);

  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // CORS preflight — el plugin de CORS ya responde OPTIONS; no validar JWT aquí.
    if (request.method === 'OPTIONS') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Token no provisto');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    // Revocación / offboarding (#5b): el token es válido y no venció, pero la
    // cuenta puede haberse desactivado o la sesión revocada (tokenVersion).
    const estado = await this.estadoDeCuenta(payload.empresaId, payload.sub);
    if (!estado || !estado.activo) {
      throw new UnauthorizedException('La cuenta está desactivada o ya no existe');
    }
    if (payload.tokenVersion !== undefined && payload.tokenVersion !== estado.tokenVersion) {
      throw new UnauthorizedException('Sesión revocada — vuelve a iniciar sesión');
    }

    request.user = payload;
    return true;
  }

  private async estadoDeCuenta(empresaId: string, usuarioId: string) {
    const key = `${empresaId}:${usuarioId}`;
    const hit = this.estadoCuenta.get(key);
    if (hit !== undefined) return hit;
    // `usuarios` tiene RLS — sin withTenant() esta consulta no ve la fila.
    const u = await this.prisma.withTenant(empresaId, (tx) =>
      tx.usuario.findUnique({
        where: { id: usuarioId },
        select: { activo: true, tokenVersion: true },
      }),
    );
    this.estadoCuenta.set(key, u ?? null);
    return u ?? null;
  }

  private extractToken(request: any): string | undefined {
    const authHeader: string | undefined = request.headers?.authorization;
    if (!authHeader) return undefined;
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
