import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RolesBaseService } from './roles-base.service';

describe('RolesBaseService', () => {
  let prisma: any;
  let service: RolesBaseService;

  beforeEach(() => {
    prisma = {
      rol: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      usuario: {
        groupBy: vi.fn().mockResolvedValue([]),
      },
      permiso: {
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn((fn: any) => fn(prisma)),
    };
    service = new RolesBaseService(prisma);
  });

  describe('findAll', () => {
    it('solo trae roles base (empresaId null) y les adjunta enUso + protegido', async () => {
      prisma.rol.findMany.mockResolvedValue([
        { id: 'r1', codigo: 'owner', permisos: [] },
        { id: 'r2', codigo: 'almacenero', permisos: [] },
      ]);
      prisma.usuario.groupBy.mockResolvedValue([
        { rolId: 'r2', empresaId: 'e1', _count: 3 },
        { rolId: 'r2', empresaId: 'e2', _count: 1 },
      ]);

      const r = await service.findAll();

      expect(prisma.rol.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { empresaId: null } }),
      );
      expect(r[0]).toMatchObject({ codigo: 'owner', protegido: true, enUso: { usuarios: 0, negocios: 0 } });
      expect(r[1]).toMatchObject({ codigo: 'almacenero', protegido: false, enUso: { usuarios: 4, negocios: 2 } });
    });
  });

  describe('findOne', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.rol.findFirst.mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
    });

    it('devuelve el rol con enUso', async () => {
      prisma.rol.findFirst.mockResolvedValue({ id: 'r2', codigo: 'almacenero', permisos: [] });
      const r = await service.findOne('r2');
      expect(r).toMatchObject({ codigo: 'almacenero', protegido: false, enUso: { usuarios: 0, negocios: 0 } });
    });
  });

  describe('create', () => {
    it('crea un rol base', async () => {
      prisma.rol.create.mockResolvedValue({ id: 'r9', codigo: 'auditor', permisos: [{ modulo: 'reportes' }] });
      const r = await service.create({ codigo: 'auditor', label: 'Auditor', permisos: ['reportes'] } as any);
      expect(r.codigo).toBe('auditor');
      expect(prisma.rol.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ empresaId: null, esPersonalizado: false }) }),
      );
    });

    it('rechaza códigos reservados (owner/admin)', async () => {
      await expect(service.create({ codigo: 'owner', label: 'X', permisos: ['a'] } as any)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.rol.create).not.toHaveBeenCalled();
    });

    it('traduce P2002 a conflicto de código', async () => {
      prisma.rol.create.mockRejectedValue({ code: 'P2002' });
      await expect(service.create({ codigo: 'auditor', label: 'X', permisos: ['a'] } as any)).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.rol.findFirst.mockResolvedValue(null);
      await expect(service.update('x', { label: 'y' })).rejects.toThrow(NotFoundException);
    });

    it('bloquea editar permisos de un rol protegido', async () => {
      prisma.rol.findFirst.mockResolvedValue({ id: 'r1', codigo: 'owner', permisos: [] });
      await expect(service.update('r1', { permisos: ['dashboard'] })).rejects.toThrow(ForbiddenException);
    });

    it('permite renombrar un rol protegido (solo texto de UI)', async () => {
      prisma.rol.findFirst.mockResolvedValue({ id: 'r1', codigo: 'owner', permisos: [] });
      prisma.rol.update.mockResolvedValue({ id: 'r1', label: 'Propietario del negocio' });
      const r = await service.update('r1', { label: 'Propietario del negocio', descripcion: 'Dueño' });
      expect(r.label).toBe('Propietario del negocio');
      expect(prisma.permiso.deleteMany).not.toHaveBeenCalled();
    });

    it('reemplaza permisos de un rol normal dentro de la transacción', async () => {
      prisma.rol.findFirst.mockResolvedValue({ id: 'r2', codigo: 'almacenero', permisos: [] });
      prisma.rol.update.mockResolvedValue({ id: 'r2', permisos: [{ modulo: 'inventario' }] });
      await service.update('r2', { permisos: ['inventario'] });
      expect(prisma.permiso.deleteMany).toHaveBeenCalledWith({ where: { rolId: 'r2' } });
    });
  });

  describe('remove', () => {
    it('bloquea eliminar un rol protegido', async () => {
      prisma.rol.findFirst.mockResolvedValue({ id: 'r1', codigo: 'owner', permisos: [] });
      await expect(service.remove('r1')).rejects.toThrow(ForbiddenException);
    });

    it('bloquea eliminar un rol en uso', async () => {
      prisma.rol.findFirst.mockResolvedValue({ id: 'r2', codigo: 'almacenero', permisos: [] });
      prisma.usuario.groupBy.mockResolvedValue([{ rolId: 'r2', empresaId: 'e1', _count: 2 }]);
      await expect(service.remove('r2')).rejects.toThrow(ConflictException);
      expect(prisma.rol.delete).not.toHaveBeenCalled();
    });

    it('elimina un rol libre', async () => {
      prisma.rol.findFirst.mockResolvedValue({ id: 'r3', codigo: 'temporal', permisos: [] });
      prisma.usuario.groupBy.mockResolvedValue([]);
      prisma.rol.delete.mockResolvedValue({ id: 'r3' });
      const r = await service.remove('r3');
      expect(r).toEqual({ id: 'r3', eliminado: true });
    });
  });
});
