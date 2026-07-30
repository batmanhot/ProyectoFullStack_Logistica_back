import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';

vi.mock('bcrypt', () => ({
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
  });

  describe('remove', () => {
    it('elimina físicamente el usuario', async () => {
      const txMock = { usuario: { delete: vi.fn().mockResolvedValue({ id: 'u1' }) } };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'u1' }) // findOne
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));
      const r = await service.remove('e1', 'u1');
      expect(r.eliminado).toBe(true);
      expect(txMock.usuario.delete).toHaveBeenCalled();
    });
  });
});
