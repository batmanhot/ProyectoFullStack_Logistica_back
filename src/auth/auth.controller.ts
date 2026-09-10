import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, TenantId } from '../common/decorators/tenant.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { DemoLoginDto } from './dto/demo-login.dto';
import { JwtPayload } from '../common/guards/jwt-auth.guard';
import { RT_COOKIE, clearRefreshCookie, expEnSegundos, setRefreshCookie } from '../common/utils/auth-cookies';

const RT_MAX_AGE = () => expEnSegundos(process.env.JWT_REFRESH_EXPIRES_IN, 7 * 86400);

/**
 * Sin prefijo propio: los paths de cada método ya incluyen el segmento
 * completo para respetar literalmente el contrato de la sección 6.3
 * (GET /api/empresas/:codigo, POST /api/auth/login, POST /api/auth/refresh).
 *
 * #5 (2026-09-10): el refresh token se emite como cookie httpOnly (`sp_rt`,
 * path `/api/auth`), no en el body. El access token (corto) sí va en el body
 * y el frontend lo tiene en memoria, no en localStorage.
 */
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('empresas/:codigo')
  buscarEmpresa(@Param('codigo') codigo: string) {
    return this.authService.buscarEmpresaPorCodigo(codigo);
  }

  // Hallazgo Crítico #4 (auditoría 2026-07-29): sin este límite, login/demo-login
  // eran vulnerables a fuerza bruta y credential stuffing sin ninguna fricción.
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: FastifyReply) {
    const { accessToken, refreshToken, usuario } = await this.authService.login(
      dto.empresaId,
      dto.email,
      dto.password,
    );
    setRefreshCookie(res, RT_COOKIE.tenant, refreshToken, RT_MAX_AGE());
    return { accessToken, usuario };
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('auth/refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const rt = req.cookies?.[RT_COOKIE.tenant.nombre];
    if (!rt) throw new UnauthorizedException('No hay sesión activa');
    const { accessToken, refreshToken, usuario } = await this.authService.refresh(rt);
    setRefreshCookie(res, RT_COOKIE.tenant, refreshToken, RT_MAX_AGE());
    return { accessToken, usuario };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/demo-login')
  @HttpCode(HttpStatus.OK)
  async demoLogin(@Body() dto: DemoLoginDto, @Res({ passthrough: true }) res: FastifyReply) {
    const { accessToken, refreshToken, usuario } = await this.authService.demoLogin(
      dto.empresaId,
      dto.usuarioId,
    );
    setRefreshCookie(res, RT_COOKIE.tenant, refreshToken, RT_MAX_AGE());
    return { accessToken, usuario };
  }

  /**
   * Hallazgo Alto #6 (auditoría 2026-07-29): incrementa Usuario.tokenVersion,
   * lo que invalida todo refresh token emitido antes. Además borra la cookie.
   */
  @Post('auth/logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @TenantId() empresaId: string,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    clearRefreshCookie(res, RT_COOKIE.tenant);
    await this.authService.logout(empresaId, user.sub);
  }

  /** Vista 360° del usuario autenticado (Mi Perfil). Cualquier usuario logueado; solo lectura. */
  @Get('auth/me')
  perfil(@TenantId() empresaId: string, @CurrentUser() user: JwtPayload) {
    return this.authService.perfil(empresaId, user.sub);
  }
}
