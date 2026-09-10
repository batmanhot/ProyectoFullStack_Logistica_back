import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { JwtService } from '@nestjs/jwt';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { verificarTokenPortalCliente } from '../common/guards/portal-cliente.guard';
import {
  RT_COOKIE,
  clearRefreshCookie,
  expEnSegundos,
  setRefreshCookie,
} from '../common/utils/auth-cookies';
import { PortalSessionDto } from './dto/portal-session.dto';

const PORTAL_MAX_AGE = () => expEnSegundos(process.env.PORTAL_JWT_EXPIRES_IN, 365 * 86400);

/**
 * Residual de #5: el token de link del Portal de Clientes (JWT de larga
 * duración) vivía en `sessionStorage` — visible para un XSS del portal. Ahora
 * se canjea una vez por una cookie httpOnly `sp_portal_rt` (path `/api/portal`)
 * y el frontend deja de persistirlo. El token sigue llegando en la URL
 * `/portal/:token` (naturaleza del magic link), pero ya no queda accesible al
 * JS después del canje.
 *
 * Controlador aparte de PortalClienteController porque aquél tiene
 * `@UseGuards(PortalClienteGuard)` a nivel de clase y estas rutas son el paso
 * PREVIO a tener credencial.
 */
@Public()
@Controller('portal')
export class PortalAuthController {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('session')
  @HttpCode(HttpStatus.OK)
  async session(
    @Body() dto: PortalSessionDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const payload = await verificarTokenPortalCliente(this.jwt, this.prisma, dto.token);
    setRefreshCookie(res, RT_COOKIE.portalCliente, dto.token, PORTAL_MAX_AGE());
    return {
      cliente: {
        id: payload.sub,
        empresaId: payload.empresaId,
        nombre: payload.clienteNombre ?? null,
      },
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: FastifyReply) {
    clearRefreshCookie(res, RT_COOKIE.portalCliente);
  }
}
