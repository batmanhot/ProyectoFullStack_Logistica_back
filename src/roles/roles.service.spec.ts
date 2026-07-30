import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RolesService } from './roles.service';

describe('RolesService', () => {
  let prisma: any;
  let service: RolesService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new RolesService(prisma);
  });

  describe('findOne', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.withTenant.mockResolvedValue(null);
      await expect(service.findOne('e1', 'x')).rejects.toThrow(NotFoundException);
    });

    it('devuelve el rol con permisos', async () => {
      prisma.withTenant.mockResolvedValue({ id: 'admin', label: 'Admin', permisos: [] });
      expect((await service.findOne('e1', 'admin')).label).toBe('Admin');
    });
  });

  describe('create', () => {
    it('crea un rol personalizado', async () => {
      const dto = { codigo: 'ventas', label: 'Ventas', permisos: ['Clientes', 'Proformas'] };
      prisma.withTenant.mockResolvedValue({ id: 'ventas', ...dto, esPersonalizado: true });
      const r = await service.create('e1', dto as any);
      expect(r.esPersonalizado).toBe(true);
    });

    it('lanza ConflictException en código duplicado (P2002)', async () => {
      prisma.withTenant.mockRejectedValue({ code: 'P2002' });
      await expect(service.create('e1', { codigo: 'dup', label: 'X', permisos: [] } as any))
        .rejects.toThrow(ConflictException);
    });

    it('re-lanza errores desconocidos', async () => {
      prisma.withTenant.mockRejectedValue(new Error('DB error'));
      await expect(service.create('e1', { codigo: 'x', label: 'X', permisos: [] } as any))
        .rejects.toThrow('DB error');
    });
  });

  describe('update', () => {
    it('lanza ForbiddenException al intentar modificar rol del catálogo base (empresaId null)', async () => {
      prisma.withTenant.mockResolvedValueOnce({ id: 'admin', empresaId: null, permisos: [] });
      await expect(service.update('e1', 'admin', { label: 'X' })).rejects.toThrow(ForbiddenException);
    });

    it('actualiza el rol propio del tenant', async () => {
      const rolPropio = { id: 'ventas', empresaId: 'e1', permisos: [] };
      prisma.withTenant
        .mockResolvedValueOnce(rolPropio)  // findOne
        .mockImplementationOnce((_e: string, fn: any) => fn({
          permiso: { deleteMany: vi.fn() },
          rol: { update: vi.fn().mockResolvedValue({ id: 'ventas', label: 'Ventas Pro' }) },
        }));
      const r = await service.update('e1', 'ventas', { label: 'Ventas Pro' });
      expect(r.label).toBe('Ventas Pro');
    });
  });

  describe('remove', () => {
    it('lanza ForbiddenException al intentar eliminar rol del catálogo base', async () => {
      prisma.withTenant.mockResolvedValueOnce({ id: 'admin', empresaId: null, permisos: [] });
      await expect(service.remove('e1', 'admin')).rejects.toThrow(ForbiddenException);
    });

    it('elimina (físicamente) el rol propio', async () => {
      const txMock = { rol: { delete: vi.fn().mockResolvedValue({ id: 'v' }) } };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'ventas', empresaId: 'e1', permisos: [] })
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));
      const r = await service.remove('e1', 'ventas');
      expect(r.eliminado).toBe(true);
      expect(txMock.rol.delete).toHaveBeenCalled();
    });
  });

  describe('verificarPermiso', () => {
    it('lanza BadRequestException si rolId o modulo no se proveen', async () => {
      await expect(service.verificarPermiso('e1', '', 'Clientes')).rejects.toThrow(BadRequestException);
      await expect(service.verificarPermiso('e1', 'admin', '')).rejects.toThrow(BadRequestException);
    });

    it('devuelve permitido=true si el rol tiene el módulo', async () => {
      prisma.withTenant.mockResolvedValue({ permisos: [{ modulo: 'Clientes' }] });
      expect((await service.verificarPermiso('e1', 'admin', 'Clientes')).permitido).toBe(true);
    });

    it('devuelve permitido=true si el rol tiene comodín *', async () => {
      prisma.withTenant.mockResolvedValue({ permisos: [{ modulo: '*' }] });
      expect((await service.verificarPermiso('e1', 'admin', 'Productos')).permitido).toBe(true);
    });

    it('devuelve permitido=false si el módulo no está en permisos', async () => {
      prisma.withTenant.mockResolvedValue({ permisos: [{ modulo: 'Clientes' }] });
      expect((await service.verificarPermiso('e1', 'admin', 'Productos')).permitido).toBe(false);
    });

    it('lanza BadRequestException si el rol no existe', async () => {
      prisma.withTenant.mockResolvedValue(null);
      await expect(service.verificarPermiso('e1', 'x', 'Clientes')).rejects.toThrow(BadRequestException);
    });
  });
});
