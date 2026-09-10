import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RolesService } from './roles.service';

describe('RolesService', () => {
  let prisma: any;
  let service: RolesService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new RolesService(prisma);
  });

  describe('findAll', () => {
    it('lista los roles del tenant (base + propios) por la RLS', async () => {
      prisma.withTenant.mockResolvedValue([{ id: 'admin', permisos: [] }]);
      const r = await service.findAll('e1');
      expect(r).toHaveLength(1);
    });
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

  describe('verificarPermiso', () => {
    it('lanza BadRequestException si rolId o modulo no se proveen', async () => {
      await expect(service.verificarPermiso('e1', '', 'Clientes')).rejects.toThrow(BadRequestException);
      await expect(service.verificarPermiso('e1', 'admin', '')).rejects.toThrow(BadRequestException);
    });

    it('devuelve permitido=true si el rol tiene el módulo', async () => {
      prisma.withTenant.mockResolvedValue({ permisos: [{ modulo: 'Clientes' }] });
      expect((await service.verificarPermiso('e1', 'admin', 'Clientes')).permitido).toBe(true);
    });

    it('devuelve permitido=true y viaComodin=true si el rol tiene comodín *', async () => {
      prisma.withTenant.mockResolvedValue({ permisos: [{ modulo: '*' }] });
      const r = await service.verificarPermiso('e1', 'admin', 'Productos');
      expect(r.permitido).toBe(true);
      expect(r.viaComodin).toBe(true);
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
