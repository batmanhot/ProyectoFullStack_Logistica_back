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
  let service: NegociosService;

  beforeEach(() => {
    prismaMock = {
      empresa: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      planSaaS: { findUnique: vi.fn() },
    };
    service = new NegociosService(prismaMock);
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

describe('NegociosService.suspenderTrialsVencidos (cron diario)', () => {
  let prismaMock: any;
  let service: NegociosService;

  beforeEach(() => {
    prismaMock = { empresa: { updateMany: vi.fn() } };
    service = new NegociosService(prismaMock);
  });

  it('suspende únicamente negocios activos en estado "trial" con fechaVencimiento pasada', async () => {
    prismaMock.empresa.updateMany.mockResolvedValue({ count: 3 });

    const total = await service.suspenderTrialsVencidos();

    expect(prismaMock.empresa.updateMany).toHaveBeenCalledWith({
      where: { activo: true, estado: 'trial', fechaVencimiento: { lt: expect.any(Date) } },
      data: { activo: false, estado: 'vencido' },
    });
    expect(total).toBe(3);
  });
});
