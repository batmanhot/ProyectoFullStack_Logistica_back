import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as bcrypt from 'bcrypt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let prismaMock: any;
  let jwtMock: any;
  let auditoriaMock: any;
  let service: AuthService;

  beforeEach(() => {
    prismaMock = {
      empresa: { findUnique: vi.fn() },
      withTenant: vi.fn(),
    };
    jwtMock = {
      signAsync: vi.fn().mockResolvedValue('token-firmado'),
      verifyAsync: vi.fn(),
    };
    auditoriaMock = {
      registrar: vi.fn().mockResolvedValue(undefined),
    };
    service = new AuthService(prismaMock, jwtMock, auditoriaMock);
  });

  describe('buscarEmpresaPorCodigo — paso 1 del login', () => {
    it('lanza Unauthorized si la empresa no existe', async () => {
      prismaMock.empresa.findUnique.mockResolvedValue(null);
      await expect(service.buscarEmpresaPorCodigo('inexistente')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('lanza Unauthorized si la empresa está inactiva', async () => {
      prismaMock.empresa.findUnique.mockResolvedValue({ id: '1', activo: false });
      await expect(service.buscarEmpresaPorCodigo('dlnorte')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('normaliza el código a minúsculas antes de buscar', async () => {
      prismaMock.empresa.findUnique.mockResolvedValue({
        id: '1',
        activo: true,
        codigo: 'dlnorte',
      });
      await service.buscarEmpresaPorCodigo('DLNORTE');
      expect(prismaMock.empresa.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { codigo: 'dlnorte' } }),
      );
    });

    it('no incluye usuariosDemo si la empresa no es de origen demo, aunque modoDesarrollo esté activo', async () => {
      prismaMock.empresa.findUnique.mockResolvedValue({
        id: '1', activo: true, codigo: 'real', origen: 'admin_saas', modoDesarrollo: true,
      });
      const r = await service.buscarEmpresaPorCodigo('real');
      expect(r.usuariosDemo).toEqual([]);
      expect(prismaMock.withTenant).not.toHaveBeenCalled();
    });

    it('no incluye usuariosDemo si la empresa es demo pero modoDesarrollo está apagado', async () => {
      prismaMock.empresa.findUnique.mockResolvedValue({
        id: '1', activo: true, codigo: 'dlnorte', origen: 'demo', modoDesarrollo: false,
      });
      const r = await service.buscarEmpresaPorCodigo('dlnorte');
      expect(r.usuariosDemo).toEqual([]);
      expect(prismaMock.withTenant).not.toHaveBeenCalled();
    });

    it('incluye usuariosDemo (por rol, sin passwordHash) si es demo y modoDesarrollo está activo', async () => {
      prismaMock.empresa.findUnique.mockResolvedValue({
        id: '1', activo: true, codigo: 'dlnorte', origen: 'demo', modoDesarrollo: true,
      });
      const usuarios = [{ id: 'u1', nombre: 'Admin', email: 'admin@dlnorte.demo', rol: { codigo: 'admin', label: 'Administrador' } }];
      prismaMock.withTenant.mockResolvedValue(usuarios);
      const r = await service.buscarEmpresaPorCodigo('dlnorte');
      expect(r.usuariosDemo).toEqual(usuarios);
      expect(prismaMock.withTenant).toHaveBeenCalledWith('1', expect.any(Function));
    });
  });

  describe('login — paso 2 del login', () => {
    const usuarioBase = {
      id: 'u1',
      empresaId: 'e1',
      nombre: 'Admin',
      email: 'admin@demo.com',
      rolId: 'r1',
      areaId: 'a1',
      activo: true,
      rol: { codigo: 'admin', label: 'Administrador', permisos: [{ modulo: '*' }] },
    };

    it('lanza Unauthorized si el usuario no existe (mensaje genérico, sin filtrar la causa)', async () => {
      prismaMock.withTenant.mockResolvedValue(null);
      await expect(service.login('e1', 'no@existe.com', 'x')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('lanza Unauthorized si el usuario está inactivo', async () => {
      prismaMock.withTenant.mockResolvedValue({ ...usuarioBase, activo: false, passwordHash: 'x' });
      await expect(service.login('e1', usuarioBase.email, 'cualquiera')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('lanza Unauthorized si el password no coincide', async () => {
      const hash = await bcrypt.hash('correcto123', 12);
      prismaMock.withTenant.mockResolvedValue({ ...usuarioBase, passwordHash: hash });
      await expect(service.login('e1', usuarioBase.email, 'incorrecto')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('emite accessToken y refreshToken con password correcto, sin exponer el hash', async () => {
      const hash = await bcrypt.hash('correcto123', 12);
      prismaMock.withTenant.mockResolvedValue({ ...usuarioBase, passwordHash: hash });

      const resultado = await service.login('e1', usuarioBase.email, 'correcto123');

      expect(resultado.accessToken).toBe('token-firmado');
      expect(resultado.refreshToken).toBe('token-firmado');
      expect(resultado.usuario).not.toHaveProperty('passwordHash');
      expect(resultado.usuario.rol.permisos).toEqual(['*']);
      expect(resultado.usuario.areaId).toBe('a1');
    });
  });

  describe('demoLogin — acceso rápido de modo desarrollo', () => {
    const usuarioBase = {
      id: 'u1',
      empresaId: 'e1',
      nombre: 'Admin',
      email: 'admin@dlnorte.demo',
      rolId: 'r1',
      areaId: null,
      activo: true,
      rol: { codigo: 'admin', label: 'Administrador', permisos: [{ modulo: '*' }] },
    };

    it('lanza Unauthorized si la empresa no existe', async () => {
      prismaMock.empresa.findUnique.mockResolvedValue(null);
      await expect(service.demoLogin('e1', 'u1')).rejects.toThrow(UnauthorizedException);
    });

    it('lanza Unauthorized si la empresa no es de origen demo', async () => {
      prismaMock.empresa.findUnique.mockResolvedValue({ id: 'e1', activo: true, origen: 'admin_saas', modoDesarrollo: true });
      await expect(service.demoLogin('e1', 'u1')).rejects.toThrow(UnauthorizedException);
    });

    it('lanza Unauthorized si modoDesarrollo está apagado', async () => {
      prismaMock.empresa.findUnique.mockResolvedValue({ id: 'e1', activo: true, origen: 'demo', modoDesarrollo: false });
      await expect(service.demoLogin('e1', 'u1')).rejects.toThrow(UnauthorizedException);
    });

    it('lanza Unauthorized si el usuario no existe', async () => {
      prismaMock.empresa.findUnique.mockResolvedValue({ id: 'e1', activo: true, origen: 'demo', modoDesarrollo: true });
      prismaMock.withTenant.mockResolvedValue(null);
      await expect(service.demoLogin('e1', 'u1')).rejects.toThrow(UnauthorizedException);
    });

    it('emite tokens sin pedir password cuando la empresa es demo y modoDesarrollo está activo', async () => {
      prismaMock.empresa.findUnique.mockResolvedValue({ id: 'e1', activo: true, origen: 'demo', modoDesarrollo: true });
      prismaMock.withTenant.mockResolvedValue(usuarioBase);

      const resultado = await service.demoLogin('e1', 'u1');

      expect(resultado.accessToken).toBe('token-firmado');
      expect(resultado.usuario).not.toHaveProperty('passwordHash');
      expect(resultado.usuario.email).toBe('admin@dlnorte.demo');
    });
  });

  describe('refresh — rotación de tokens', () => {
    it('lanza Unauthorized si el refresh token no verifica', async () => {
      jwtMock.verifyAsync.mockRejectedValue(new Error('expirado'));
      await expect(service.refresh('token-invalido')).rejects.toThrow(UnauthorizedException);
    });

    it('lanza Unauthorized si el usuario ya no existe o está inactivo', async () => {
      jwtMock.verifyAsync.mockResolvedValue({ sub: 'u1', empresaId: 'e1' });
      prismaMock.withTenant.mockResolvedValue(null);
      await expect(service.refresh('token-valido')).rejects.toThrow(UnauthorizedException);
    });
  });
});
