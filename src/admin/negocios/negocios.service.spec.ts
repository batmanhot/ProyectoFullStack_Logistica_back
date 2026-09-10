import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { NegociosService } from './negocios.service';

describe('NegociosService.create', () => {
  let prismaMock: any;
  let service: NegociosService;

  // rol.findFirst devuelve el rol base por su codigo (owner / admin).
  const rolPorCodigo = ({ where }: any) =>
    Promise.resolve(where?.codigo === 'owner' ? { id: 'rol-owner-global' } : { id: 'rol-admin-global' });

  // DTO mínimo válido con el nuevo contrato: Propietario (owner) obligatorio.
  const dtoOwner = {
    codigo: 'nuevo-tenant',
    nombre: 'Nuevo Tenant SAC',
    ruc: '20999999999',
    ownerNombre: 'Prop',
    ownerEmail: 'prop@nuevo.demo',
    ownerPassword: 'password123',
  };

  beforeEach(() => {
    prismaMock = {
      planSaaS: { findUnique: vi.fn() },
      rol: { findFirst: vi.fn(rolPorCodigo) },
      $transaction: vi.fn(),
      activarTenantEnTransaccion: vi.fn().mockResolvedValue(undefined),
    };
    service = new NegociosService(prismaMock);
  });

  it('rechaza si no existe el rol base "owner" (seed no corrido)', async () => {
    prismaMock.rol.findFirst.mockResolvedValue(null);
    await expect(service.create({ ...dtoOwner } as any)).rejects.toThrow(BadRequestException);
  });

  it('rechaza si el plan indicado no existe en el catálogo', async () => {
    prismaMock.planSaaS.findUnique.mockResolvedValue(null);
    await expect(
      service.create({ ...dtoOwner, plan: 'plan-inexistente' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza si se envía el Admin del Negocio a medias (falta email o password)', async () => {
    await expect(
      service.create({ ...dtoOwner, adminNombre: 'Solo nombre' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('crea la Empresa + el Propietario (rol owner) en la misma transacción, sin exponer la contraseña', async () => {
    const txMock = {
      empresa: { create: vi.fn().mockResolvedValue({ id: 'emp-1', codigo: 'nuevo-tenant', nombre: 'Nuevo Tenant SAC' }), findUnique: vi.fn().mockResolvedValue({ plan: null }) },
      planSaaS: { findUnique: vi.fn() },
      usuario: { create: vi.fn().mockResolvedValue({ id: 'usr-1', nombre: 'Prop', email: 'prop@nuevo.demo' }), count: vi.fn().mockResolvedValue(0) },
    };
    prismaMock.$transaction.mockImplementation((fn: any) => fn(txMock));

    const resultado = await service.create({ ...dtoOwner, codigo: 'NUEVO-TENANT' } as any);

    expect(txMock.empresa.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ codigo: 'nuevo-tenant' }) }),
    );
    expect(prismaMock.activarTenantEnTransaccion).toHaveBeenCalledWith(txMock, 'emp-1');
    expect(txMock.usuario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ empresaId: 'emp-1', rolId: 'rol-owner-global' }),
        select: { id: true, nombre: true, email: true }, // nunca selecciona passwordHash
      }),
    );
    expect(txMock.usuario.create).toHaveBeenCalledTimes(1); // solo el Propietario
    expect(resultado.usuarioOwner).toEqual({ id: 'usr-1', nombre: 'Prop', email: 'prop@nuevo.demo' });
    expect((resultado as any).passwordHash).toBeUndefined();
  });

  it('crea también el Admin del Negocio (rol admin) si se envían sus 3 campos', async () => {
    const txMock = {
      empresa: { create: vi.fn().mockResolvedValue({ id: 'emp-1' }), findUnique: vi.fn().mockResolvedValue({ plan: null }) },
      planSaaS: { findUnique: vi.fn() },
      usuario: {
        create: vi.fn()
          .mockResolvedValueOnce({ id: 'usr-owner', nombre: 'Prop', email: 'prop@nuevo.demo' })
          .mockResolvedValueOnce({ id: 'usr-admin', nombre: 'Admin', email: 'admin@nuevo.demo' }),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    prismaMock.$transaction.mockImplementation((fn: any) => fn(txMock));

    const resultado = await service.create({
      ...dtoOwner,
      adminNombre: 'Admin',
      adminEmail: 'admin@nuevo.demo',
      adminPassword: 'password123',
    } as any);

    expect(txMock.usuario.create).toHaveBeenCalledTimes(2);
    expect(txMock.usuario.create).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: expect.objectContaining({ rolId: 'rol-owner-global' }) }));
    expect(txMock.usuario.create).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: expect.objectContaining({ rolId: 'rol-admin-global' }) }));
    expect(resultado.usuarioAdminInicial).toEqual({ id: 'usr-admin', nombre: 'Admin', email: 'admin@nuevo.demo' });
  });

  it('traduce el error P2002 (codigo/ruc duplicado) a un mensaje claro', async () => {
    prismaMock.$transaction.mockRejectedValue({ code: 'P2002' });
    await expect(service.create({ ...dtoOwner, codigo: 'dlnorte' } as any)).rejects.toThrow(BadRequestException);
  });

  it('el mensaje del P2002 nombra el campo concreto que chocó (RUC vs slug)', async () => {
    prismaMock.$transaction.mockRejectedValue({ code: 'P2002', meta: { target: ['ruc'] } });
    const dto = { ...dtoOwner, codigo: 'abc', ruc: '20123456789' } as any;
    await expect(service.create(dto)).rejects.toThrow(/RUC/i);
    await expect(service.create(dto)).rejects.not.toThrow(/slug/i);
  });

  it('pasa el estado (ej. "trial") a la Empresa creada', async () => {
    const txMock = {
      empresa: { create: vi.fn().mockResolvedValue({ id: 'emp-1' }), findUnique: vi.fn().mockResolvedValue({ plan: null }) },
      planSaaS: { findUnique: vi.fn() },
      usuario: { create: vi.fn().mockResolvedValue({ id: 'usr-1', nombre: 'Prop', email: 'prop@nuevo.demo' }), count: vi.fn().mockResolvedValue(0) },
    };
    prismaMock.$transaction.mockImplementation((fn: any) => fn(txMock));

    await service.create({ ...dtoOwner, codigo: 'empresa-vacia', estado: 'trial' } as any);

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
      empresa: { update: vi.fn().mockResolvedValue({ id: 'e1' }), findUnique: vi.fn().mockResolvedValue({ plan: null }) },
      planSaaS: { findUnique: vi.fn() },
      usuario: {
        findFirst: vi.fn().mockResolvedValue({ id: 'usr-admin', empresaId: 'e1', activo: true }),
        update: vi.fn().mockResolvedValue({ id: 'usr-admin' }),
        count: vi.fn().mockResolvedValue(0),
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

  it('NO intenta crear el admin si solo llegan datos de perfil sueltos (sin nombre/email/password)', async () => {
    prismaMock.empresa.findUnique.mockResolvedValue({ id: 'e1' });
    txMock.empresa.update.mockResolvedValue({ id: 'e1' });
    txMock.usuario.findFirst.mockResolvedValue(null); // no existe admin
    txMock.rol = { findFirst: vi.fn() };
    txMock.usuario.create = vi.fn();

    await service.update('e1', { nombre: 'Negocio X', adminTelefono: '999', adminCargo: 'Jefe' } as any);

    expect(txMock.usuario.create).not.toHaveBeenCalled();
    expect(txMock.rol.findFirst).not.toHaveBeenCalled();
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

  // Regresión: `usuarios` tiene RLS por tenant. findOne/findAll leen al
  // Propietario y al Admin del Negocio dentro de withTenant() — sin eso el
  // panel del SuperAdmin recibía owner nulo / 0 usuarios aunque los datos
  // estuvieran guardados.
  const txConGobierno = () => ({
    usuario: {
      findFirst: vi.fn().mockResolvedValue({ id: 'u-owner', nombre: 'Prop', email: 'prop@x.com' }),
      findMany: vi.fn().mockResolvedValue([{ id: 'u-admin', nombre: 'Adm', email: 'adm@x.com' }]),
      count: vi.fn().mockResolvedValue(2),
    },
    auditoria: { findFirst: vi.fn().mockResolvedValue({ timestamp: new Date('2026-09-08T10:00:00Z') }) },
  });

  it('findOne lee al Propietario/Admin dentro de withTenant (RLS de `usuarios`)', async () => {
    prismaMock.empresa.findUnique.mockResolvedValue({ id: 'e1', nombre: 'X', estado: 'activo', fechaVencimiento: null });
    prismaMock.withTenant.mockImplementation((_id: string, fn: any) => fn(txConGobierno()));

    const negocio = await service.findOne('e1');

    expect(negocio.usuarioOwner).toEqual({ id: 'u-owner', nombre: 'Prop', email: 'prop@x.com' });
    expect(negocio.usuarios).toEqual([{ id: 'u-admin', nombre: 'Adm', email: 'adm@x.com' }]);
    expect(negocio._count.usuarios).toBe(2);
  });

  it('findAll resuelve usuarioOwner/usuarios por empresa dentro de withTenant', async () => {
    prismaMock.empresa.findMany.mockResolvedValue([
      { id: 'e1', nombre: 'X', estado: 'activo', fechaVencimiento: null },
    ]);
    prismaMock.withTenant.mockImplementation((_id: string, fn: any) => fn(txConGobierno()));

    const [negocio] = await service.findAll();

    expect(negocio.usuarioOwner).toEqual({ id: 'u-owner', nombre: 'Prop', email: 'prop@x.com' });
    expect(negocio.usuarios).toEqual([{ id: 'u-admin', nombre: 'Adm', email: 'adm@x.com' }]);
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

describe('NegociosService.vista360', () => {
  let prisma: any;
  let service: NegociosService;

  beforeEach(() => {
    prisma = {
      empresa: { findUnique: vi.fn() },
      planSaaS: { findUnique: vi.fn() },
      renovacionPlan: { findMany: vi.fn().mockResolvedValue([]) },
      facturaSaaS: { groupBy: vi.fn().mockResolvedValue([]), aggregate: vi.fn().mockResolvedValue({ _sum: { total: 0 }, _count: 0 }) },
      respaldoNegocio: { findFirst: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(0) },
      solicitudRestauracion: { count: vi.fn().mockResolvedValue(0) },
      withTenant: vi.fn(async (_id: string, fn: any) =>
        fn({
          usuario: { findFirst: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(0) },
          auditoria: { findFirst: vi.fn().mockResolvedValue(null) },
        }),
      ),
    };
    service = new NegociosService(prisma);
  });

  it('404 si el negocio no existe', async () => {
    prisma.empresa.findUnique.mockResolvedValue(null);
    await expect(service.vista360('x')).rejects.toThrow(/no encontrado/i);
  });

  it('sin señales cuando todo está sano; señal crítica cuando el plan está vencido', async () => {
    const base = { id: 'e1', nombre: 'A', codigo: 'a', ruc: '20x', email: 'a@a.com', origen: 'admin_saas', createdAt: new Date() };
    prisma.empresa.findUnique.mockResolvedValue({ ...base, estado: 'activo', fechaVencimiento: new Date(Date.now() + 60 * 86400000), plan: null });
    prisma.respaldoNegocio.findFirst.mockResolvedValue({ createdAt: new Date(), estado: 'COMPLETADO', integridad: 'VERIFICADO', formato: null, origen: 'manual' });
    const sano = await service.vista360('e1');
    expect(sano.senales).toEqual([]);

    prisma.empresa.findUnique.mockResolvedValue({ ...base, estado: 'activo', fechaVencimiento: new Date(Date.now() - 10 * 86400000), plan: null });
    const vencido = await service.vista360('e1');
    expect(vencido.senales.some((s: any) => s.tipo === 'plan' && s.nivel === 'critica')).toBe(true);
  });
});
