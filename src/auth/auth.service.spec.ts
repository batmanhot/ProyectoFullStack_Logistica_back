import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
      // Por defecto el acceso rápido está APAGADO (switch de plataforma en false);
      // los tests que lo necesitan lo prenden explícitamente.
      plataformaConfig: { findFirst: vi.fn().mockResolvedValue({ accesoRapidoTarjetas: false }) },
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

    it('lanza Unauthorized si el negocio está suspendido', async () => {
      prismaMock.empresa.findUnique.mockResolvedValue({ id: '1', activo: true, estado: 'suspendido' });
      await expect(service.buscarEmpresaPorCodigo('dlnorte')).rejects.toThrow(UnauthorizedException);
    });

    it('lanza Unauthorized si el negocio está cancelado', async () => {
      prismaMock.empresa.findUnique.mockResolvedValue({ id: '1', activo: true, estado: 'cancelado' });
      await expect(service.buscarEmpresaPorCodigo('dlnorte')).rejects.toThrow(UnauthorizedException);
    });

    it('lanza Unauthorized si el trial venció (fechaVencimiento en el pasado)', async () => {
      prismaMock.empresa.findUnique.mockResolvedValue({
        id: '1', activo: true, estado: 'trial', fechaVencimiento: new Date('2020-01-01'),
      });
      await expect(service.buscarEmpresaPorCodigo('dlnorte')).rejects.toThrow(UnauthorizedException);
    });

    it('permite el acceso si el trial todavía no vence', async () => {
      const fechaFutura = new Date(Date.now() + 30 * 86_400_000);
      prismaMock.empresa.findUnique.mockResolvedValue({
        id: '1', activo: true, estado: 'trial', fechaVencimiento: fechaFutura, origen: 'admin_saas',
      });
      await expect(service.buscarEmpresaPorCodigo('dlnorte')).resolves.toMatchObject({ id: '1' });
    });

    it('permite el acceso dentro del período de gracia (venció hace 2 días, gracia = 5)', async () => {
      const hace2dias = new Date(Date.now() - 2 * 86_400_000);
      prismaMock.empresa.findUnique.mockResolvedValue({
        id: '1', activo: true, estado: 'activo', fechaVencimiento: hace2dias, origen: 'admin_saas',
      });
      await expect(service.buscarEmpresaPorCodigo('dlnorte')).resolves.toMatchObject({ id: '1' });
    });

    it('bloquea una vez agotado el período de gracia (venció hace 6 días, gracia = 5)', async () => {
      const hace6dias = new Date(Date.now() - 6 * 86_400_000);
      prismaMock.empresa.findUnique.mockResolvedValue({
        id: '1', activo: true, estado: 'activo', fechaVencimiento: hace6dias,
      });
      await expect(service.buscarEmpresaPorCodigo('dlnorte')).rejects.toThrow(UnauthorizedException);
    });

    it('lanza Unauthorized si el negocio está archivado (eliminación definitiva)', async () => {
      prismaMock.empresa.findUnique.mockResolvedValue({ id: '1', activo: true, estado: 'archivado' });
      await expect(service.buscarEmpresaPorCodigo('dlnorte')).rejects.toThrow(UnauthorizedException);
    });

    describe('usuariosDemo — controlado por el switch de plataforma', () => {
      const NODE_ENV_ORIG = process.env.NODE_ENV;
      const ALLOW_ORIG = process.env.ALLOW_DEMO_LOGIN;
      const usuarios = [{ id: 'u1', nombre: 'Admin', email: 'admin@x.pe', rol: { codigo: 'admin', label: 'Administrador' } }];
      afterEach(() => {
        process.env.NODE_ENV = NODE_ENV_ORIG;
        if (ALLOW_ORIG === undefined) delete process.env.ALLOW_DEMO_LOGIN;
        else process.env.ALLOW_DEMO_LOGIN = ALLOW_ORIG;
      });

      it('lista todos los usuarios activos si el switch de plataforma está ON', async () => {
        prismaMock.plataformaConfig.findFirst.mockResolvedValue({ accesoRapidoTarjetas: true });
        prismaMock.empresa.findUnique.mockResolvedValue({ id: '1', activo: true, codigo: 'carbolec', origen: 'admin_saas' });
        prismaMock.withTenant.mockResolvedValue(usuarios);
        const r = await service.buscarEmpresaPorCodigo('carbolec');
        expect(r.usuariosDemo).toEqual(usuarios);
        expect(prismaMock.withTenant).toHaveBeenCalledWith('1', expect.any(Function));
      });

      it('devuelve [] si el switch de plataforma está OFF', async () => {
        prismaMock.plataformaConfig.findFirst.mockResolvedValue({ accesoRapidoTarjetas: false });
        prismaMock.empresa.findUnique.mockResolvedValue({ id: '1', activo: true, codigo: 'carbolec', origen: 'demo' });
        const r = await service.buscarEmpresaPorCodigo('carbolec');
        expect(r.usuariosDemo).toEqual([]);
        expect(prismaMock.withTenant).not.toHaveBeenCalled();
      });

      it('sin fila de config: ON fuera de producción', async () => {
        process.env.NODE_ENV = 'test';
        prismaMock.plataformaConfig.findFirst.mockResolvedValue(null);
        prismaMock.empresa.findUnique.mockResolvedValue({ id: '1', activo: true, codigo: 'x', origen: 'admin_saas' });
        prismaMock.withTenant.mockResolvedValue(usuarios);
        const r = await service.buscarEmpresaPorCodigo('x');
        expect(r.usuariosDemo).toEqual(usuarios);
      });

      it('candado de entorno: [] en producción sin ALLOW_DEMO_LOGIN aunque el switch esté ON', async () => {
        process.env.NODE_ENV = 'production';
        delete process.env.ALLOW_DEMO_LOGIN;
        prismaMock.plataformaConfig.findFirst.mockResolvedValue({ accesoRapidoTarjetas: true });
        prismaMock.empresa.findUnique.mockResolvedValue({ id: '1', activo: true, codigo: 'x', origen: 'demo' });
        const r = await service.buscarEmpresaPorCodigo('x');
        expect(r.usuariosDemo).toEqual([]);
        expect(prismaMock.withTenant).not.toHaveBeenCalled();
      });

      it('en producción con ALLOW_DEMO_LOGIN=true y switch ON: lista', async () => {
        process.env.NODE_ENV = 'production';
        process.env.ALLOW_DEMO_LOGIN = 'true';
        prismaMock.plataformaConfig.findFirst.mockResolvedValue({ accesoRapidoTarjetas: true });
        prismaMock.empresa.findUnique.mockResolvedValue({ id: '1', activo: true, codigo: 'x', origen: 'admin_saas' });
        prismaMock.withTenant.mockResolvedValue(usuarios);
        const r = await service.buscarEmpresaPorCodigo('x');
        expect(r.usuariosDemo).toEqual(usuarios);
      });
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

    beforeEach(() => {
      // Empresa activa por default en este describe — los tests de bloqueo
      // por empresa vencida/suspendida tienen su propio caso más abajo.
      prismaMock.empresa.findUnique.mockResolvedValue({ activo: true, estado: 'activo', fechaVencimiento: null });
    });

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

    it('lanza Unauthorized si la empresa venció, sin llegar a validar el password', async () => {
      prismaMock.empresa.findUnique.mockResolvedValue({
        activo: true, estado: 'trial', fechaVencimiento: new Date('2020-01-01'),
      });
      await expect(service.login('e1', usuarioBase.email, 'correcto123')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prismaMock.withTenant).not.toHaveBeenCalled();
    });
  });

  describe('demoLogin — acceso rápido (login sin contraseña)', () => {
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

    beforeEach(() => {
      // Switch de plataforma ON por default en este describe.
      prismaMock.plataformaConfig.findFirst.mockResolvedValue({ accesoRapidoTarjetas: true });
    });

    it('lanza Unauthorized si el switch de plataforma está OFF', async () => {
      prismaMock.plataformaConfig.findFirst.mockResolvedValue({ accesoRapidoTarjetas: false });
      await expect(service.demoLogin('e1', 'u1')).rejects.toThrow(UnauthorizedException);
      expect(prismaMock.empresa.findUnique).not.toHaveBeenCalled();
    });

    it('lanza Unauthorized si la empresa no existe', async () => {
      prismaMock.empresa.findUnique.mockResolvedValue(null);
      await expect(service.demoLogin('e1', 'u1')).rejects.toThrow(UnauthorizedException);
    });

    it('lanza Unauthorized si el usuario no existe', async () => {
      prismaMock.empresa.findUnique.mockResolvedValue({ id: 'e1', activo: true });
      prismaMock.withTenant.mockResolvedValue(null);
      await expect(service.demoLogin('e1', 'u1')).rejects.toThrow(UnauthorizedException);
    });

    it('emite tokens sin password para cualquier empresa cuando el switch está ON', async () => {
      prismaMock.empresa.findUnique.mockResolvedValue({ id: 'e1', activo: true, origen: 'admin_saas' });
      prismaMock.withTenant.mockResolvedValue(usuarioBase);

      const resultado = await service.demoLogin('e1', 'u1');

      expect(resultado.accessToken).toBe('token-firmado');
      expect(resultado.usuario).not.toHaveProperty('passwordHash');
      expect(resultado.usuario.email).toBe('admin@dlnorte.demo');
    });

    it('lanza Unauthorized si el trial de la empresa venció (aunque el switch esté ON)', async () => {
      prismaMock.empresa.findUnique.mockResolvedValue({
        id: 'e1', activo: true, estado: 'trial', fechaVencimiento: new Date('2020-01-01'),
      });
      await expect(service.demoLogin('e1', 'u1')).rejects.toThrow(UnauthorizedException);
    });

    describe('candado de entorno (producción)', () => {
      const NODE_ENV_ORIG = process.env.NODE_ENV;
      const ALLOW_ORIG = process.env.ALLOW_DEMO_LOGIN;
      beforeEach(() => { process.env.NODE_ENV = 'production'; });
      afterEach(() => {
        process.env.NODE_ENV = NODE_ENV_ORIG;
        if (ALLOW_ORIG === undefined) delete process.env.ALLOW_DEMO_LOGIN;
        else process.env.ALLOW_DEMO_LOGIN = ALLOW_ORIG;
      });

      it('bloquea aunque el switch esté ON si no hay ALLOW_DEMO_LOGIN=true', async () => {
        delete process.env.ALLOW_DEMO_LOGIN;
        prismaMock.empresa.findUnique.mockResolvedValue({ id: 'e1', activo: true });
        await expect(service.demoLogin('e1', 'u1')).rejects.toThrow(UnauthorizedException);
      });

      it('con ALLOW_DEMO_LOGIN=true y switch ON: emite tokens sin password', async () => {
        process.env.ALLOW_DEMO_LOGIN = 'true';
        prismaMock.empresa.findUnique.mockResolvedValue({ id: 'e1', activo: true, origen: 'admin_saas' });
        prismaMock.withTenant.mockResolvedValue(usuarioBase);

        const resultado = await service.demoLogin('e1', 'u1');

        expect(resultado.accessToken).toBe('token-firmado');
        expect(resultado.usuario).not.toHaveProperty('passwordHash');
      });
    });
  });

  describe('refresh — rotación de tokens', () => {
    beforeEach(() => {
      prismaMock.empresa.findUnique.mockResolvedValue({ activo: true, estado: 'activo', fechaVencimiento: null });
    });

    it('lanza Unauthorized si el refresh token no verifica', async () => {
      jwtMock.verifyAsync.mockRejectedValue(new Error('expirado'));
      await expect(service.refresh('token-invalido')).rejects.toThrow(UnauthorizedException);
    });

    it('lanza Unauthorized si el usuario ya no existe o está inactivo', async () => {
      jwtMock.verifyAsync.mockResolvedValue({ sub: 'u1', empresaId: 'e1' });
      prismaMock.withTenant.mockResolvedValue(null);
      await expect(service.refresh('token-valido')).rejects.toThrow(UnauthorizedException);
    });

    it('lanza Unauthorized si la empresa fue suspendida después de emitido el refresh token', async () => {
      jwtMock.verifyAsync.mockResolvedValue({ sub: 'u1', empresaId: 'e1' });
      prismaMock.empresa.findUnique.mockResolvedValue({ activo: true, estado: 'suspendido', fechaVencimiento: null });
      await expect(service.refresh('token-valido')).rejects.toThrow(UnauthorizedException);
      expect(prismaMock.withTenant).not.toHaveBeenCalled();
    });
  });
});
