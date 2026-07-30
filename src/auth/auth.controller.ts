import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, TenantId } from '../common/decorators/tenant.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { DemoLoginDto } from './dto/demo-login.dto';
import { JwtPayload } from '../common/guards/jwt-auth.guard';

/**
 * Sin prefijo propio: los paths de cada método ya incluyen el segmento
 * completo para respetar literalmente el contrato de la sección 6.3
 * (GET /api/empresas/:codigo, POST /api/auth/login, POST /api/auth/refresh).
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
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.empresaId, dto.email, dto.password);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('auth/refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/demo-login')
  @HttpCode(HttpStatus.OK)
  demoLogin(@Body() dto: DemoLoginDto) {
    return this.authService.demoLogin(dto.empresaId, dto.usuarioId);
  }

  /**
   * Hallazgo Alto #6 (auditoría 2026-07-29): antes no existía forma de revocar
   * un refresh token antes de su expiración natural (7 días) — ni logout.
   * Incrementa Usuario.tokenVersion: todo refresh token emitido antes de este
   * momento deja de servir de inmediato (ver AuthService.refresh/logout).
   */
  @Post('auth/logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@TenantId() empresaId: string, @CurrentUser() user: JwtPayload) {
    return this.authService.logout(empresaId, user.sub);
  }
}
