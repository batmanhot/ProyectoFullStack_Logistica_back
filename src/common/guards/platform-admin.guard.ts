import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

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
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Token de administrador no provisto');
    }

    try {
      const payload = await this.jwtService.verifyAsync<PlatformAdminPayload>(token, {
        secret: process.env.ADMIN_JWT_SECRET,
      });
      request.platformAdmin = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Token de administrador inválido o expirado');
    }
  }

  private extractToken(request: any): string | undefined {
    const authHeader: string | undefined = request.headers?.authorization;
    if (!authHeader) return undefined;
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
