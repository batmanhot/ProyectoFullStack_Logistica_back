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
import { RefreshDto } from './dto/refresh.dto';
import { JwtPayload } from '../common/guards/jwt-auth.guard';
import { clearRefreshCookie, cookieTenant, expEnSegundos, nombreCookieTenant, setRefreshCookie } from '../common/utils/auth-cookies';

const RT_MAX_AGE = () => expEnSegundos(process.env.JWT_REFRESH_EXPIRES_IN, 7 * 86400);

/**
 * Sin prefijo propio: los paths de cada método ya incluyen el segmento
 * completo para respetar literalmente el contrato de la sección 6.3
 * (GET /api/empresas/:codigo, POST /api/auth/login, POST /api/auth/refresh).
 *
 * #5 (2026-09-10): el refresh token se emite como cookie httpOnly
 * (`sp_rt_<empresaId>`, una por negocio, path `/api/auth`), no en el body. El
 * access token (corto) sí va en el body y el frontend lo tiene en memoria, no
 * en localStorage. Cookie por empresa → varias sesiones de negocio conviven en
 * el mismo navegador (una por pestaña).
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
    setRefreshCookie(res, cookieTenant(dto.empresaId), refreshToken, RT_MAX_AGE());
    return { accessToken, usuario };
  }

  // El front comparte un lock single-flight para el refresh, pero varias pestañas
  // + reintentos con backoff tras un 5xx pueden sumar llamadas legítimas. 60/min
  // deja holgura sin abrir la puerta a abuso (el refresh igual valida la cookie).
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('auth/refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const rt = req.cookies?.[nombreCookieTenant(dto.empresaId)];
    if (!rt) throw new UnauthorizedException('No hay sesión activa');
    const { accessToken, refreshToken, usuario } = await this.authService.refresh(rt);
    // La cookie va por empresa, pero se verifica igual que el token pertenece a
    // la que la pestaña dice ser — que un `sp_rt_*` de otro negocio no sirva acá.
    if (usuario.empresaId !== dto.empresaId) {
      throw new UnauthorizedException('La sesión no corresponde a esta empresa');
    }
    setRefreshCookie(res, cookieTenant(dto.empresaId), refreshToken, RT_MAX_AGE());
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
    setRefreshCookie(res, cookieTenant(dto.empresaId), refreshToken, RT_MAX_AGE());
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
    clearRefreshCookie(res, cookieTenant(empresaId));
    await this.authService.logout(empresaId, user.sub);
  }

  /** Vista 360° del usuario autenticado (Mi Perfil). Cualquier usuario logueado; solo lectura. */
  @Get('auth/me')
  perfil(@TenantId() empresaId: string, @CurrentUser() user: JwtPayload) {
    return this.authService.perfil(empresaId, user.sub);
  }
}
