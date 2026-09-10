import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('$hash$') },
  hash: vi.fn().mockResolvedValue('$hash$'),
}));

describe('UsuariosService', () => {
  let prisma: any;
  let service: UsuariosService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new UsuariosService(prisma);
  });

  describe('findOne', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.withTenant.mockResolvedValue(null);
      await expect(service.findOne('e1', 'x')).rejects.toThrow(NotFoundException);
    });

    it('devuelve el usuario (sin passwordHash)', async () => {
      prisma.withTenant.mockResolvedValue({ id: 'u1', nombre: 'Ana', email: 'ana@test.com' });
      expect((await service.findOne('e1', 'u1')).nombre).toBe('Ana');
    });
  });

  describe('create', () => {
    const dto = { nombre: 'Pedro', email: 'pedro@test.com', password: '1234', rolId: 'rol1' };

    it('rechaza si el rol no existe', async () => {
      prisma.withTenant.mockResolvedValueOnce(null); // validarRol → null
      await expect(service.create('e1', dto as any)).rejects.toThrow(BadRequestException);
    });

    it('crea el usuario con password hasheado', async () => {
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'rol1' })     // validarRol
        .mockResolvedValueOnce({ id: 'u2', nombre: 'Pedro', email: 'pedro@test.com' });
      const r = await service.create('e1', dto as any);
      expect(r.nombre).toBe('Pedro');
    });

    it('rechaza área que no existe', async () => {
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'rol1' })  // validarRol
        .mockResolvedValueOnce(null);             // validarArea → null
      await expect(service.create('e1', { ...dto, areaId: 'a-404' } as any))
        .rejects.toThrow(BadRequestException);
    });

    it('lanza ConflictException en email duplicado (P2002)', async () => {
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'rol1' }) // validarRol
        .mockRejectedValueOnce({ code: 'P2002' });
      await expect(service.create('e1', dto as any)).rejects.toThrow(ConflictException);
    });

    it('rechaza crear un usuario con rol owner (gestionado por la plataforma)', async () => {
      prisma.withTenant.mockResolvedValueOnce({ id: 'rol-owner', codigo: 'owner' }); // validarRol
      await expect(service.create('e1', dto as any)).rejects.toThrow(ForbiddenException);
    });

    it('rechaza crear un usuario con rol admin (gestionado por la plataforma)', async () => {
      prisma.withTenant.mockResolvedValueOnce({ id: 'rol-admin', codigo: 'admin' }); // validarRol
      await expect(service.create('e1', dto as any)).rejects.toThrow(ForbiddenException);
    });

    it('rechaza el alta si el plan ya está en su tope de cuentas activas', async () => {
      const tx = {
        empresa: { findUnique: vi.fn().mockResolvedValue({ plan: 'pro' }) },
        planSaaS: { findUnique: vi.fn().mockResolvedValue({ maxUsuarios: 3 }) },
        usuario: { count: vi.fn().mockResolvedValue(3), create: vi.fn() },
      };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'rol1', codigo: 'supervisor' }) // validarRol
        .mockImplementationOnce((_e: string, fn: any) => fn(tx));      // create → assert cupos
      await expect(service.create('e1', dto as any)).rejects.toThrow(ForbiddenException);
      expect(tx.usuario.create).not.toHaveBeenCalled();
    });

    it('guarda los datos de perfil (telefono / documento / cargo)', async () => {
      const tx = {
        empresa: { findUnique: vi.fn().mockResolvedValue({ plan: null }) },
        planSaaS: { findUnique: vi.fn() },
        usuario: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({ id: 'u3' }) },
      };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'rol1', codigo: 'almacenero' })
        .mockImplementationOnce((_e: string, fn: any) => fn(tx));
      await service.create('e1', { ...dto, telefono: '999', documento: '12345678', cargo: 'Jefe' } as any);
      expect(tx.usuario.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ telefono: '999', documento: '12345678', cargo: 'Jefe' }) }),
      );
    });
  });

  describe('update', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.withTenant.mockResolvedValueOnce(null);
      await expect(service.update('e1', 'x', {})).rejects.toThrow(NotFoundException);
    });

    it('actualiza datos básicos sin cambiar password', async () => {
      const txMock = { usuario: { update: vi.fn().mockResolvedValue({ id: 'u1', nombre: 'Ana B.' }) } };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'u1' }) // findOne
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));
      const r = await service.update('e1', 'u1', { nombre: 'Ana B.' });
      expect(r.nombre).toBe('Ana B.');
    });

    it('re-hashea el password cuando se provee en el update', async () => {
      const txMock = { usuario: { update: vi.fn().mockResolvedValue({ id: 'u1' }) } };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'u1' }) // findOne
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));
      await service.update('e1', 'u1', { password: 'newPass' });
      expect(txMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ passwordHash: '$hash$' }) }),
      );
    });

    it('rechaza editar un usuario Propietario (rol owner, gestionado por la plataforma)', async () => {
      prisma.withTenant.mockResolvedValueOnce({ id: 'u1', rol: { codigo: 'owner' } }); // findOne
      await expect(service.update('e1', 'u1', { nombre: 'X' })).rejects.toThrow(ForbiddenException);
    });

    it('rechaza promover un usuario normal a rol admin', async () => {
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'u1', rol: { codigo: 'supervisor' } }) // findOne
        .mockResolvedValueOnce({ id: 'rol-admin', codigo: 'admin' });         // validarRol
      await expect(service.update('e1', 'u1', { rolId: 'rol-admin' })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('elimina físicamente el usuario', async () => {
      const txMock = { usuario: { delete: vi.fn().mockResolvedValue({ id: 'u1' }) } };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'u1', rol: { codigo: 'almacenero' } }) // findOne
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));
      const r = await service.remove('e1', 'u1');
      expect(r.eliminado).toBe(true);
      expect(txMock.usuario.delete).toHaveBeenCalled();
    });

    it('rechaza eliminar un usuario Admin del Negocio (rol admin)', async () => {
      prisma.withTenant.mockResolvedValueOnce({ id: 'u1', rol: { codigo: 'admin' } }); // findOne
      await expect(service.remove('e1', 'u1')).rejects.toThrow(ForbiddenException);
    });
  });
});
