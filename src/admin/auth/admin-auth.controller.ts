import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { RT_COOKIE, clearRefreshCookie, expEnSegundos, setRefreshCookie } from '../../common/utils/auth-cookies';

const RT_MAX_AGE = () => expEnSegundos(process.env.ADMIN_JWT_REFRESH_EXPIRES_IN, 30 * 86400);

/**
 * #5 (2026-09-10): el refresh token del SuperAdmin va en cookie httpOnly
 * (`sp_admin_rt`, path `/api/admin/auth`), no en el body. El access token
 * (8 h) va en el body y el frontend lo tiene en memoria, no en localStorage.
 */
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  // Hallazgo Crítico #4 (auditoría 2026-07-29): el login de PlatformAdmin
  // compromete TODA la plataforma si se fuerza por fuerza bruta.
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: AdminLoginDto, @Res({ passthrough: true }) res: FastifyReply) {
    const { accessToken, refreshToken, admin } = await this.adminAuthService.login(dto.email, dto.password);
    setRefreshCookie(res, RT_COOKIE.admin, refreshToken, RT_MAX_AGE());
    return { accessToken, admin };
  }

  // Renovación silenciosa del access token de 8 h — el refresh token viene de
  // la cookie httpOnly, no del body.
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const rt = req.cookies?.[RT_COOKIE.admin.nombre];
    if (!rt) throw new UnauthorizedException('No hay sesión de administrador activa');
    const { accessToken, refreshToken, admin } = await this.adminAuthService.refresh(rt);
    setRefreshCookie(res, RT_COOKIE.admin, refreshToken, RT_MAX_AGE());
    return { accessToken, admin };
  }

  // Borra la cookie de refresh. No hace falta auth: quien la tenga puede
  // pedir que se la borren. (PlatformAdmin no tiene tokenVersion, así que no
  // hay revocación server-side del access de 8 h — la mitiga PlatformAdminGuard,
  // que revalida `activo` en cada request.)
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: FastifyReply) {
    clearRefreshCookie(res, RT_COOKIE.admin);
  }
}
