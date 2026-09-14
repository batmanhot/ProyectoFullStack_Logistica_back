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

    // Alcance de roles (2026-09-11): `modulo` acepta un array — match por
    // cualquiera de la lista (endpoints alcanzables por el permiso completo
    // O uno angosto, ej. 'despachos' vs 'despachos-aprobar').
    it('con un array, permitido=true si el rol tiene CUALQUIERA de los módulos', async () => {
      prisma.withTenant.mockResolvedValue({ permisos: [{ modulo: 'despachos-aprobar' }] });
      const r = await service.verificarPermiso('e1', 'admin', ['despachos', 'despachos-aprobar']);
      expect(r.permitido).toBe(true);
      expect(r.viaComodin).toBe(false);
    });

    it('con un array, permitido=false si el rol no tiene ninguno', async () => {
      prisma.withTenant.mockResolvedValue({ permisos: [{ modulo: 'inventario' }] });
      const r = await service.verificarPermiso('e1', 'admin', ['despachos', 'despachos-aprobar']);
      expect(r.permitido).toBe(false);
    });

    it('con un array, el comodín sigue bypaseando todo', async () => {
      prisma.withTenant.mockResolvedValue({ permisos: [{ modulo: '*' }] });
      const r = await service.verificarPermiso('e1', 'owner', ['despachos', 'despachos-aprobar']);
      expect(r.permitido).toBe(true);
      expect(r.viaComodin).toBe(true);
    });
  });
});
