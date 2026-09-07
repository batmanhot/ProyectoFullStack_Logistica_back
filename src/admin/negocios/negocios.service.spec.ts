import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { NegociosService } from './negocios.service';

describe('NegociosService.create', () => {
  let prismaMock: any;
  let service: NegociosService;

  beforeEach(() => {
    prismaMock = {
      planSaaS: { findUnique: vi.fn() },
      rol: { findFirst: vi.fn() },
      $transaction: vi.fn(),
      activarTenantEnTransaccion: vi.fn().mockResolvedValue(undefined),
    };
    service = new NegociosService(prismaMock);
  });

  it('rechaza si no existe el rol base "admin" (seed de Fase 1 no corrido)', async () => {
    prismaMock.rol.findFirst.mockResolvedValue(null);

    await expect(
      service.create({
        codigo: 'nuevo-tenant',
        nombre: 'Nuevo Tenant SAC',
        ruc: '20999999999',
        adminNombre: 'Admin',
        adminEmail: 'admin@nuevo.demo',
        adminPassword: 'password123',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza si el plan indicado no existe en el catálogo', async () => {
    prismaMock.planSaaS.findUnique.mockResolvedValue(null);

    await expect(
      service.create({
        codigo: 'nuevo-tenant',
        nombre: 'Nuevo Tenant SAC',
        ruc: '20999999999',
        plan: 'plan-inexistente',
        adminNombre: 'Admin',
        adminEmail: 'admin@nuevo.demo',
        adminPassword: 'password123',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('crea la Empresa Y el Usuario admin inicial en la misma transacción, sin exponer la contraseña', async () => {
    prismaMock.rol.findFirst.mockResolvedValue({ id: 'rol-admin-global' });

    const txMock = {
      empresa: {
        create: vi.fn().mockResolvedValue({ id: 'emp-1', codigo: 'nuevo-tenant', nombre: 'Nuevo Tenant SAC' }),
      },
      usuario: {
        create: vi.fn().mockResolvedValue({ id: 'usr-1', nombre: 'Admin', email: 'admin@nuevo.demo' }),
      },
    };
    prismaMock.$transaction.mockImplementation((fn: any) => fn(txMock));

    const resultado = await service.create({
      codigo: 'NUEVO-TENANT', // debe normalizarse a minúscula
      nombre: 'Nuevo Tenant SAC',
      ruc: '20999999999',
      adminNombre: 'Admin',
      adminEmail: 'admin@nuevo.demo',
      adminPassword: 'password123',
    } as any);

    expect(txMock.empresa.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ codigo: 'nuevo-tenant' }) }),
    );
    // Sin esto, el insert de abajo viola RLS (bug real: la tabla `usuarios`
    // exige app.current_tenant activo, y create() no usa withTenant()).
    expect(prismaMock.activarTenantEnTransaccion).toHaveBeenCalledWith(txMock, 'emp-1');
    expect(txMock.usuario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ empresaId: 'emp-1', rolId: 'rol-admin-global' }),
        select: { id: true, nombre: true, email: true }, // nunca selecciona passwordHash
      }),
    );
    expect(resultado.usuarioAdminInicial).toEqual({ id: 'usr-1', nombre: 'Admin', email: 'admin@nuevo.demo' });
    expect((resultado as any).passwordHash).toBeUndefined();
  });

  it('traduce el error P2002 (codigo/ruc duplicado) a un mensaje claro', async () => {
    prismaMock.rol.findFirst.mockResolvedValue({ id: 'rol-admin-global' });
    prismaMock.$transaction.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.create({
        codigo: 'dlnorte',
        nombre: 'Duplicado',
        ruc: '20100000001',
        adminNombre: 'Admin',
        adminEmail: 'admin@dup.demo',
        adminPassword: 'password123',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('pasa el estado (ej. "trial") a la Empresa creada — para que una empresa de prueba nazca como trial, no como "activo" por default', async () => {
    prismaMock.rol.findFirst.mockResolvedValue({ id: 'rol-admin-global' });
    const txMock = {
      empresa: { create: vi.fn().mockResolvedValue({ id: 'emp-1' }) },
      usuario: { create: vi.fn().mockResolvedValue({ id: 'usr-1', nombre: 'Admin', email: 'admin@nuevo.demo' }) },
    };
    prismaMock.$transaction.mockImplementation((fn: any) => fn(txMock));

    await service.create({
      codigo: 'empresa-vacia',
      nombre: 'Empresa de Prueba',
      ruc: '20999999998',
      estado: 'trial',
      adminNombre: 'Admin',
      adminEmail: 'admin@nuevo.demo',
      adminPassword: 'password123',
    } as any);

    expect(txMock.empresa.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'trial' }) }),
    );
  });
});

describe('NegociosService.update', () => {
  let prismaMock: any;
  let txMock: any;
  let service: NegociosService;

  beforeEach(() => {
    txMock = {
      empresa: { update: vi.fn().mockResolvedValue({ id: 'e1' }) },
      usuario: {
        findFirst: vi.fn().mockResolvedValue({ id: 'usr-admin', empresaId: 'e1' }),
        update: vi.fn().mockResolvedValue({ id: 'usr-admin' }),
      },
    };

    prismaMock = {
      empresa: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      usuario: { findFirst: vi.fn(), update: vi.fn() },
      planSaaS: { findUnique: vi.fn() },
      activarTenantEnTransaccion: vi.fn().mockResolvedValue(undefined),
      $transaction: vi.fn((fn) => fn(txMock)),
    };
    service = new NegociosService(prismaMock);
  });

  it('actualiza el usuario administrador del negocio si se envían credenciales nuevas', async () => {
    prismaMock.empresa.findUnique.mockResolvedValue({ id: 'e1' });
    txMock.empresa.update.mockResolvedValue({ id: 'e1' });
    txMock.usuario.findFirst.mockResolvedValue({ id: 'usr-admin', empresaId: 'e1' });
    txMock.usuario.update.mockResolvedValue({ id: 'usr-admin' });

    await service.update('e1', {
      nombre: 'Nuevo nombre negocio',
      adminNombre: 'Admin actualizado',
      adminEmail: 'nuevo-admin@demo.com',
      adminPassword: 'nuevaPassword123',
    } as any);

    expect(prismaMock.activarTenantEnTransaccion).toHaveBeenCalledWith(txMock, 'e1');
    expect(txMock.usuario.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ empresaId: 'e1' }),
      }),
    );
    expect(txMock.usuario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'usr-admin' },
        data: expect.objectContaining({
          nombre: 'Admin actualizado',
          email: 'nuevo-admin@demo.com',
        }),
      }),
    );
  });

  it('crea el usuario administrador si el negocio no tenía uno asociado y se envían credenciales nuevas', async () => {
    prismaMock.empresa.findUnique.mockResolvedValue({ id: 'e1' });
    txMock.empresa.update.mockResolvedValue({ id: 'e1' });
    txMock.usuario.findFirst.mockResolvedValue(null);
    txMock.rol = { findFirst: vi.fn().mockResolvedValue({ id: 'rol-admin-global' }) };
    txMock.usuario.create = vi.fn().mockResolvedValue({ id: 'usr-admin-nuevo' });

    await service.update('e1', {
      nombre: 'Negocio sin admin',
      adminNombre: 'Admin nuevo',
      adminEmail: 'admin-nuevo@demo.com',
      adminPassword: 'nuevaPassword123',
    } as any);

    expect(txMock.rol.findFirst).toHaveBeenCalledWith({
      where: { empresaId: null, codigo: 'admin' },
    });
    expect(txMock.usuario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          empresaId: 'e1',
          nombre: 'Admin nuevo',
          email: 'admin-nuevo@demo.com',
          rolId: 'rol-admin-global',
        }),
      }),
    );
  });

  it('al reactivar un trial vencido (estado → "trial") reabre `activo` sin que se lo pidan explícitamente', async () => {
    prismaMock.empresa.findUnique.mockResolvedValue({ id: 'e1' }); // findOne()
    prismaMock.empresa.update.mockResolvedValue({ id: 'e1' });

    await service.update('e1', { estado: 'trial', fechaVencimiento: '2027-01-01' } as any);

    expect(prismaMock.empresa.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'trial', activo: true }) }),
    );
  });

  it('al suspender (estado → "suspendido") cierra `activo` sin que se lo pidan explícitamente', async () => {
    prismaMock.empresa.findUnique.mockResolvedValue({ id: 'e1' });
    prismaMock.empresa.update.mockResolvedValue({ id: 'e1' });

    await service.update('e1', { estado: 'suspendido' } as any);

    expect(prismaMock.empresa.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'suspendido', activo: false }) }),
    );
  });

  it('respeta `activo` explícito por sobre la derivación automática desde `estado`', async () => {
    prismaMock.empresa.findUnique.mockResolvedValue({ id: 'e1' });
    prismaMock.empresa.update.mockResolvedValue({ id: 'e1' });

    await service.update('e1', { estado: 'trial', activo: false } as any);

    expect(prismaMock.empresa.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'trial', activo: false }) }),
    );
  });
});

describe('NegociosService.actualizarEstadosVencimiento (cron diario)', () => {
  let prismaMock: any;
  let service: NegociosService;

  beforeEach(() => {
    prismaMock = { empresa: { updateMany: vi.fn() } };
    service = new NegociosService(prismaMock);
  });

  it('marca "vencido" a cualquier negocio automático (trial o pago) con la gracia agotada — ya no solo trials', async () => {
    prismaMock.empresa.updateMany.mockResolvedValue({ count: 3 });

    const total = await service.actualizarEstadosVencimiento();

    expect(prismaMock.empresa.updateMany).toHaveBeenCalledWith({
      where: {
        activo: true,
        estado: { notIn: ['suspendido', 'cancelado', 'archivado'] },
        fechaVencimiento: { lt: expect.any(Date) },
      },
      data: { activo: false, estado: 'vencido' },
    });
    expect(total).toBe(3);
  });
});

describe('NegociosService.findAll / findOne — estadoEfectivo', () => {
  let prismaMock: any;
  let service: NegociosService;

  beforeEach(() => {
    prismaMock = {
      empresa: { findMany: vi.fn(), findUnique: vi.fn() },
      usuario: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      withTenant: vi.fn().mockResolvedValue(null),
    };
    service = new NegociosService(prismaMock);
  });

  it('findAll agrega estadoEfectivo derivado (por_vencer) sin persistirlo', async () => {
    const en20dias = new Date(Date.now() + 20 * 86_400_000);
    prismaMock.empresa.findMany.mockResolvedValue([
      { id: 'e1', nombre: 'X', estado: 'activo', fechaVencimiento: en20dias },
    ]);

    const [negocio] = await service.findAll();

    expect(negocio.estadoEfectivo).toBe('por_vencer');
    expect(negocio.estado).toBe('activo'); // el campo guardado no cambia
  });

  it('findOne incluye ultimoAcceso (mejor esfuerzo, null si falla la consulta de Auditoria)', async () => {
    prismaMock.empresa.findUnique.mockResolvedValue({ id: 'e1', nombre: 'X', estado: 'activo', fechaVencimiento: null });
    prismaMock.withTenant.mockRejectedValue(new Error('sin RLS activo'));

    const negocio = await service.findOne('e1');

    expect(negocio.ultimoAcceso).toBeNull();
    expect(negocio.estadoEfectivo).toBe('activo');
  });
});

describe('NegociosService.archivar ("eliminar definitivamente")', () => {
  let prismaMock: any;
  let service: NegociosService;

  beforeEach(() => {
    prismaMock = {
      empresa: { findUnique: vi.fn(), update: vi.fn() },
    };
    service = new NegociosService(prismaMock);
  });

  it('rechaza si el nombre escrito no coincide EXACTO con el del negocio', async () => {
    prismaMock.empresa.findUnique.mockResolvedValue({ id: 'e1', nombre: 'Distribuidora Lima Norte' });

    await expect(service.archivar('e1', 'Lima Norte')).rejects.toThrow(BadRequestException);
    expect(prismaMock.empresa.update).not.toHaveBeenCalled();
  });

  it('acepta el nombre sin importar mayúsculas/espacios y archiva (activo:false, estado:archivado)', async () => {
    prismaMock.empresa.findUnique.mockResolvedValue({ id: 'e1', nombre: 'Distribuidora Lima Norte' });
    prismaMock.empresa.update.mockResolvedValue({ id: 'e1', estado: 'archivado' });

    await service.archivar('e1', '  distribuidora lima norte  ');

    expect(prismaMock.empresa.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { activo: false, estado: 'archivado' },
    });
  });
});
