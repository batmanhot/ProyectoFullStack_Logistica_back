import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';

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

    const options: JwtSignOptions = {
      secret: process.env.ADMIN_JWT_SECRET,
      expiresIn: (process.env.ADMIN_JWT_EXPIRES_IN ?? '8h') as JwtSignOptions['expiresIn'],
    };

    const accessToken = await this.jwt.signAsync({ sub: admin.id, email: admin.email }, options);

    return {
      accessToken,
      admin: { id: admin.id, email: admin.email, nombre: admin.nombre },
    };
  }
}
