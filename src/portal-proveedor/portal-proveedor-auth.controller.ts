import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { JwtService } from '@nestjs/jwt';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { verificarTokenPortalProveedor } from '../common/guards/portal-proveedor.guard';
import {
  RT_COOKIE,
  clearRefreshCookie,
  expEnSegundos,
  setRefreshCookie,
} from '../common/utils/auth-cookies';
import { PortalProveedorSessionDto } from './dto/portal-proveedor-session.dto';

const PORTAL_MAX_AGE = () => expEnSegundos(process.env.PORTAL_JWT_EXPIRES_IN, 365 * 86400);

/**
 * Igual que PortalAuthController pero para el Portal de Proveedores B2B: canjea
 * el token de link por la cookie httpOnly `sp_portal_prov_rt`
 * (path `/api/portal-proveedor`). Ver el comentario de aquél.
 */
@Public()
@Controller('portal-proveedor')
export class PortalProveedorAuthController {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('session')
  @HttpCode(HttpStatus.OK)
  async session(
    @Body() dto: PortalProveedorSessionDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const payload = await verificarTokenPortalProveedor(this.jwt, this.prisma, dto.token);
    setRefreshCookie(res, RT_COOKIE.portalProveedor, dto.token, PORTAL_MAX_AGE());
    return {
      proveedor: {
        id: payload.sub,
        empresaId: payload.empresaId,
        nombre: payload.proveedorNombre ?? null,
      },
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: FastifyReply) {
    clearRefreshCookie(res, RT_COOKIE.portalProveedor);
  }
}
