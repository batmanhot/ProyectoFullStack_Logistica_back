import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';

type PlatformAdminMin = { id: string; email: string; nombre: string; activo: boolean };

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Login de PlatformAdmin — completamente separado del login por tenant
   * (Fase 1). No usa withTenant(): PlatformAdmin no tiene empresaId.
   */
  async login(email: string, password: string) {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { email } });
    if (!admin || !admin.activo) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordValida = await bcrypt.compare(password, admin.passwordHash);
    if (!passwordValida) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Rastro de gobierno: el inicio de sesión de una cuenta privilegiada es un
    // evento de seguridad. Best-effort — nunca debe tumbar el login.
    this.prisma.auditoriaPlataforma
      .create({
        data: {
          adminId: admin.id,
          adminEmail: admin.email,
          accion: 'login',
          recurso: 'seguridad',
          detalle: 'Inició sesión en el panel de plataforma',
        },
      })
      .catch(() => undefined);

    return this.emitirTokens(admin);
  }

  /**
   * Renueva el access token a partir del refresh token (firmado con su PROPIO
   * secreto, TTL largo). Sin rotación con store en BD todavía: se re-verifica
   * que la cuenta siga activa y se emite un par nuevo. Un refresh a mitad de
   * sesión NO se audita (es renovación silenciosa, no un login).
   */
  async refresh(refreshToken: string) {
    let payload: { sub: string; email: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: process.env.ADMIN_JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    const admin = await this.prisma.platformAdmin.findUnique({ where: { id: payload.sub } });
    if (!admin || !admin.activo) {
      throw new UnauthorizedException('La cuenta de administrador ya no está activa — inicia sesión nuevamente');
    }

    return this.emitirTokens(admin);
  }

  /** Firma el par access + refresh (secretos y TTL distintos) para un admin. */
  private async emitirTokens(admin: PlatformAdminMin) {
    const claims = { sub: admin.id, email: admin.email };

    const accessToken = await this.jwt.signAsync(claims, {
      secret: process.env.ADMIN_JWT_SECRET,
      expiresIn: (process.env.ADMIN_JWT_EXPIRES_IN ?? '8h') as JwtSignOptions['expiresIn'],
    });

    const refreshToken = await this.jwt.signAsync(claims, {
      secret: process.env.ADMIN_JWT_REFRESH_SECRET,
      expiresIn: (process.env.ADMIN_JWT_REFRESH_EXPIRES_IN ?? '30d') as JwtSignOptions['expiresIn'],
    });

    return {
      accessToken,
      refreshToken,
      admin: { id: admin.id, email: admin.email, nombre: admin.nombre },
    };
  }
}
