import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PlatformAdminsService } from './platform-admins.service';

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('$hash$') },
  hash: vi.fn().mockResolvedValue('$hash$'),
}));

describe('PlatformAdminsService', () => {
  let prisma: any;
  let service: PlatformAdminsService;

  beforeEach(() => {
    prisma = {
      platformAdmin: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: 'a2', nombre: 'Nuevo', email: 'nuevo@x.pe', activo: true, esNativo: false }),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'a2', ...data })),
      },
    };
    service = new PlatformAdminsService(prisma);
  });

  describe('create', () => {
    it('rechaza el 3º administrador (máx. 2)', async () => {
      prisma.platformAdmin.count.mockResolvedValue(2);
      await expect(service.create({ nombre: 'X', email: 'x@x.pe', password: 'password1' } as any)).rejects.toThrow(ForbiddenException);
    });

    it('crea el 2º con esNativo=false', async () => {
      prisma.platformAdmin.count.mockResolvedValue(1);
      await service.create({ nombre: 'Nuevo', email: 'nuevo@x.pe', password: 'password1' } as any);
      expect(prisma.platformAdmin.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.not.objectContaining({ esNativo: true }) }),
      );
    });
  });

  describe('update — seguridad del CRUD', () => {
    const nativo = { id: 'a1', email: 'root@plataforma.pe', nombre: 'Root', activo: true, esNativo: true };
    const segundo = { id: 'a2', email: 'dos@plataforma.pe', nombre: 'Dos', activo: true, esNativo: false };

    it('lanza NotFound si el target no existe', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ esNativo: true });
      await expect(service.update('nope', { nombre: 'x' }, 'a1')).rejects.toThrow(NotFoundException);
    });

    it('permite editarte tu propia cuenta (nombre + contraseña)', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValueOnce(segundo).mockResolvedValueOnce({ esNativo: false });
      await expect(service.update('a2', { nombre: 'Dos B', password: 'nuevaPass1' }, 'a2')).resolves.toBeTruthy();
    });

    it('rechaza que un admin NO nativo edite a OTRO (nombre/email/contraseña)', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValueOnce(nativo).mockResolvedValueOnce({ esNativo: false });
      await expect(service.update('a1', { nombre: 'hackeado' }, 'a2')).rejects.toThrow(ForbiddenException);
    });

    it('rechaza que un admin NO nativo resetee la contraseña de otro', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValueOnce(segundo).mockResolvedValueOnce({ esNativo: false });
      await expect(service.update('a2', { password: 'tomada1234' }, 'aX')).rejects.toThrow(ForbiddenException);
    });

    it('PERMITE que el nativo edite CUALQUIER campo de otro admin no-nativo', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValueOnce(segundo).mockResolvedValueOnce({ esNativo: true });
      await service.update('a2', { nombre: 'Dos Renombrado', email: 'dos-nuevo@plataforma.pe', password: 'reseteada1' }, 'a1');
      expect(prisma.platformAdmin.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ nombre: 'Dos Renombrado', email: 'dos-nuevo@plataforma.pe', passwordHash: '$hash$' }),
        }),
      );
    });

    it('rechaza que un admin no-nativo toque la contraseña de la cuenta NATIVA', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValueOnce(nativo).mockResolvedValueOnce({ esNativo: false });
      await expect(service.update('a1', { password: 'x1234567' }, 'a2')).rejects.toThrow(ForbiddenException);
    });

    it('rechaza cambiar el email de la cuenta nativa (aunque sea su propio dueño)', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValueOnce(nativo).mockResolvedValueOnce({ esNativo: true });
      await expect(service.update('a1', { email: 'otro@plataforma.pe' }, 'a1')).rejects.toThrow(ForbiddenException);
    });

    it('rechaza desactivar la cuenta nativa', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValueOnce(nativo).mockResolvedValueOnce({ esNativo: false });
      prisma.platformAdmin.count.mockResolvedValue(2);
      await expect(service.update('a1', { activo: false }, 'a2')).rejects.toThrow(ForbiddenException);
    });

    it('rechaza desactivarte a vos mismo', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValueOnce(segundo).mockResolvedValueOnce({ esNativo: false });
      await expect(service.update('a2', { activo: false }, 'a2')).rejects.toThrow(ForbiddenException);
    });

    it('rechaza desactivar si quedaría 0 admins activos', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValueOnce(segundo).mockResolvedValueOnce({ esNativo: true });
      prisma.platformAdmin.count.mockResolvedValue(1);
      await expect(service.update('a2', { activo: false }, 'a1')).rejects.toThrow(ForbiddenException);
    });

    it('permite que el nativo desactive al 2º admin (quedando 1 activo)', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValueOnce(segundo).mockResolvedValueOnce({ esNativo: true });
      prisma.platformAdmin.count.mockResolvedValue(2);
      await service.update('a2', { activo: false }, 'a1');
      expect(prisma.platformAdmin.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ activo: false }) }),
      );
    });
  });

  describe('remove — hard delete', () => {
    const nativo = { id: 'a1', esNativo: true };
    const segundo = { id: 'a2', esNativo: false };

    beforeEach(() => {
      prisma.platformAdmin.delete = vi.fn().mockResolvedValue({ id: 'a2' });
    });

    it('lanza NotFound si el target no existe', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ esNativo: true });
      await expect(service.remove('nope', 'a1')).rejects.toThrow(NotFoundException);
    });

    it('rechaza si el actor NO es el nativo', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValueOnce(segundo).mockResolvedValueOnce({ esNativo: false });
      await expect(service.remove('a2', 'aX')).rejects.toThrow(ForbiddenException);
      expect(prisma.platformAdmin.delete).not.toHaveBeenCalled();
    });

    it('rechaza eliminar la cuenta nativa', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValueOnce(nativo).mockResolvedValueOnce({ esNativo: true });
      await expect(service.remove('a1', 'a1')).rejects.toThrow(ForbiddenException);
    });

    it('el nativo elimina a un admin no-nativo', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValueOnce(segundo).mockResolvedValueOnce({ esNativo: true });
      const r = await service.remove('a2', 'a1');
      expect(prisma.platformAdmin.delete).toHaveBeenCalledWith({ where: { id: 'a2' } });
      expect(r).toEqual({ id: 'a2', eliminado: true });
    });
  });
});
