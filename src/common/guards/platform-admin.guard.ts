import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { TtlCache } from '../utils/ttl-cache';

export interface PlatformAdminPayload {
  sub: string;
  email: string;
}

/**
 * Guard SEPARADO del JwtAuthGuard de tenant (Fase 1) — verifica el JWT
 * de PlatformAdmin contra su PROPIO secreto (ADMIN_JWT_SECRET, distinto
 * de JWT_SECRET). Las rutas /api/admin/* llevan @Public() (para que el
 * guard global de tenant no las bloquee por falta de empresaId) Y
 * @UseGuards(PlatformAdminGuard) (para exigir este token específico).
 * Los dos esquemas de auth NUNCA se mezclan — un PlatformAdmin no
 * pertenece a ninguna Empresa.
 *
 * #5b (2026-09-10): además de la firma, revalida que la cuenta siga activa /
 * exista (cache ~30 s). Sin esto, un SuperAdmin eliminado o desactivado
 * conservaba acceso hasta 8 h (lo que dura el access token).
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  private readonly adminActivo = new TtlCache<boolean>(30_000);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Token de administrador no provisto');
    }

    let payload: PlatformAdminPayload;
    try {
      payload = await this.jwtService.verifyAsync<PlatformAdminPayload>(token, {
        secret: process.env.ADMIN_JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Token de administrador inválido o expirado');
    }

    if (!(await this.sigueActivo(payload.sub))) {
      throw new UnauthorizedException('La cuenta de administrador está desactivada o ya no existe');
    }

    request.platformAdmin = payload;
    return true;
  }

  private async sigueActivo(id: string): Promise<boolean> {
    const hit = this.adminActivo.get(id);
    if (hit !== undefined) return hit;
    // PlatformAdmin no tiene RLS (no pertenece a ninguna Empresa).
    const a = await this.prisma.platformAdmin.findUnique({
      where: { id },
      select: { activo: true },
    });
    const activo = !!a?.activo;
    this.adminActivo.set(id, activo);
    return activo;
  }

  private extractToken(request: { headers?: Record<string, string | undefined> }): string | undefined {
    const authHeader = request.headers?.authorization;
    if (!authHeader) return undefined;
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
