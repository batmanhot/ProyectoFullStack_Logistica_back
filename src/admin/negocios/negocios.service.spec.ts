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
});
