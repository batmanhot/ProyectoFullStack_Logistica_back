import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

type UsuarioConRol = {
  id: string;
  empresaId: string;
  nombre: string;
  email: string;
  passwordHash: string;
  rolId: string;
  areaId: string | null;
  activo: boolean;
  tokenVersion: number;
  rol: {
    codigo: string;
    label: string;
    permisos: { modulo: string }[];
  };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Paso 1 del login (sección 6.3) — valida que el código de organización exista. */
  async buscarEmpresaPorCodigo(codigo: string) {
    const empresa = await this.prisma.empresa.findUnique({
      where: { codigo: codigo.toLowerCase() },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        nombreCorto: true,
        plan: true,
        estado: true,
        activo: true,
        origen: true,
        modoDesarrollo: true,
      },
    });

    if (!empresa || !empresa.activo) {
      throw new UnauthorizedException('Empresa no encontrada o inactiva');
    }

    return { ...empresa, usuariosDemo: await this.listarUsuariosDemo(empresa) };
  }

  /**
   * Accesos rápidos de "modo desarrollo" (Configuración → Sistema): solo se
   * listan si la empresa es de origen demo Y tiene el switch activo — nunca
   * expone passwordHash, y una empresa real con el switch activo no tiene
   * ningún efecto porque su origen no es 'demo'.
   */
  private async listarUsuariosDemo(empresa: { id: string; origen: string; modoDesarrollo: boolean }) {
    if (empresa.origen !== 'demo' || !empresa.modoDesarrollo) return [];
    return this.prisma.withTenant(empresa.id, (tx) =>
      tx.usuario.findMany({
        where: { empresaId: empresa.id, activo: true },
        select: { id: true, nombre: true, email: true, rol: { select: { codigo: true, label: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  /** Paso 2 del login. */
  async login(empresaId: string, email: string, password: string) {
    const usuario = (await this.prisma.withTenant(empresaId, (tx) =>
      tx.usuario.findUnique({
        where: { empresaId_email: { empresaId, email } },
        include: { rol: { include: { permisos: true } } },
      }),
    )) as UsuarioConRol | null;

    if (!usuario || !usuario.activo) {
      // Mensaje deliberadamente genérico — no revelar si fue el email o el password.
      this.registrarIntentoFallido(empresaId, email);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordValida = await bcrypt.compare(password, usuario.passwordHash);
    if (!passwordValida) {
      this.registrarIntentoFallido(empresaId, email, usuario.id);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const tokens = await this.emitirTokens(usuario);
    this.registrarLoginExitoso(usuario);
    return tokens;
  }

  /**
   * Acceso rápido de "modo desarrollo" — mismo resultado que login() pero sin
   * password, gateado en el propio backend (no solo en la UI): solo funciona
   * si la empresa es de origen demo y tiene el switch modoDesarrollo activo.
   */
  async demoLogin(empresaId: string, usuarioId: string) {
    // Hallazgo Medio #11 (auditoría 2026-07-29): defensa adicional en
    // profundidad — si el flag Empresa.modoDesarrollo se activara alguna vez
    // por error en producción (bug, migración, admin equivocado), esta
    // compuerta a nivel de entorno sigue bloqueando el acceso sin contraseña.
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_LOGIN !== 'true') {
      throw new UnauthorizedException('Acceso rápido no disponible');
    }

    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { id: true, activo: true, origen: true, modoDesarrollo: true },
    });
    if (!empresa || !empresa.activo || empresa.origen !== 'demo' || !empresa.modoDesarrollo) {
      throw new UnauthorizedException('Acceso rápido no disponible para esta empresa');
    }

    const usuario = (await this.prisma.withTenant(empresaId, (tx) =>
      tx.usuario.findUnique({
        where: { id: usuarioId },
        include: { rol: { include: { permisos: true } } },
      }),
    )) as UsuarioConRol | null;

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    const tokens = await this.emitirTokens(usuario);
    this.registrarLoginExitoso(usuario);
    return tokens;
  }

  // Auditoría de login best-effort: nunca debe bloquear ni fallar el login en sí.
  private registrarLoginExitoso(usuario: UsuarioConRol) {
    this.auditoria
      .registrar(usuario.empresaId, {
        usuarioId: usuario.id,
        usuarioNombre: usuario.nombre,
        accion: 'LOGIN',
        modulo: 'auth',
        detalle: `Inicio de sesión: ${usuario.email}`,
      })
      .catch(() => {});
  }

  private registrarIntentoFallido(empresaId: string, email: string, usuarioId?: string) {
    this.auditoria
      .registrar(empresaId, {
        usuarioId,
        usuarioNombre: email,
        accion: 'LOGIN_FAILED',
        modulo: 'auth',
        detalle: `Intento de acceso fallido: ${email}`,
      })
      .catch(() => {});
  }

  /**
   * Renueva el access token. Emite también un refresh token nuevo en cada
   * llamada (rotación) — decisión #1 ("JWT refresh rotation" reutilizado del
   * SDK de Mercado Pago).
   *
   * Hallazgo Alto #6 (auditoría 2026-07-29): antes la rotación era puramente
   * de emisión (stateless), sin forma de revocar un refresh token robado
   * antes de su expiración natural (7 días) — no existía ni logout. Ahora
   * el refresh token lleva un `tokenVersion`; si no coincide con
   * Usuario.tokenVersion (incrementado en logout()), se rechaza.
   */
  async refresh(refreshToken: string) {
    let payload: { sub: string; empresaId: string; tokenVersion?: number };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    const usuario = (await this.prisma.withTenant(payload.empresaId, (tx) =>
      tx.usuario.findUnique({
        where: { id: payload.sub },
        include: { rol: { include: { permisos: true } } },
      }),
    )) as UsuarioConRol | null;

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }

    if ((payload.tokenVersion ?? 0) !== usuario.tokenVersion) {
      throw new UnauthorizedException('Refresh token revocado — inicia sesión nuevamente');
    }

    return this.emitirTokens(usuario);
  }

  /**
   * Logout real (Hallazgo Alto #6): incrementa Usuario.tokenVersion, lo que
   * invalida de inmediato TODOS los refresh tokens emitidos hasta ahora para
   * este usuario (en cualquier dispositivo). El access token en curso sigue
   * vivo hasta su expiración natural (máx. JWT_EXPIRES_IN, 15m por defecto)
   * porque es stateless por diseño — el refresh es lo que de verdad importa
   * revocar, ya que dura días.
   */
  async logout(empresaId: string, usuarioId: string) {
    await this.prisma.withTenant(empresaId, (tx) =>
      tx.usuario.update({
        where: { id: usuarioId },
        data: { tokenVersion: { increment: 1 } },
      }),
    );
  }

  private async emitirTokens(usuario: UsuarioConRol) {
    const basePayload = {
      sub: usuario.id,
      empresaId: usuario.empresaId,
      email: usuario.email,
      rolId: usuario.rolId,
    };

    // Nota de tipos: @nestjs/jwt tipa `expiresIn` con un literal de plantilla
    // (StringValue, ej. '15m' | '7d' | ...) que no acepta un `string` genérico
    // como el que viene de process.env. Se castea explícitamente acá — es un
    // ajuste de tipos de compilación, no cambia el comportamiento en runtime
    // (la librería 'jsonwebtoken' subyacente sigue aceptando cualquier string
    // con el formato '15m', '7d', etc., o un número de segundos).
    const accessOptions: JwtSignOptions = {
      secret: process.env.JWT_SECRET,
      expiresIn: (process.env.JWT_EXPIRES_IN ?? '15m') as JwtSignOptions['expiresIn'],
    };

    const refreshOptions: JwtSignOptions = {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ?? '7d') as JwtSignOptions['expiresIn'],
    };

    const accessToken = await this.jwt.signAsync(basePayload, accessOptions);

    const refreshToken = await this.jwt.signAsync(
      { sub: usuario.id, empresaId: usuario.empresaId, tokenVersion: usuario.tokenVersion },
      refreshOptions,
    );

    return {
      accessToken,
      refreshToken,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        empresaId: usuario.empresaId,
        areaId: usuario.areaId,
        rol: {
          codigo: usuario.rol.codigo,
          label: usuario.rol.label,
          permisos: usuario.rol.permisos.map((p) => p.modulo),
        },
      },
      // passwordHash NUNCA se incluye en la respuesta (sección 7 — seguridad).
    };
  }
}
