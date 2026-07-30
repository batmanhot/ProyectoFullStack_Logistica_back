import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PortalProveedorService } from './portal-proveedor.service';

describe('PortalProveedorService', () => {
  let prismaMock: any;
  let jwtMock: any;
  let service: PortalProveedorService;

  beforeEach(() => {
    prismaMock = { withTenant: vi.fn() };
    jwtMock = { signAsync: vi.fn().mockResolvedValue('jwt-firmado') };
    service = new PortalProveedorService(prismaMock, jwtMock);
  });

  describe('generarLink', () => {
    it('rechaza con NotFoundException si el proveedor no existe en el tenant', async () => {
      const txMock = { proveedor: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() } };
      prismaMock.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      await expect(service.generarLink('e1', 'prov-1')).rejects.toThrow(NotFoundException);
      expect(txMock.proveedor.update).not.toHaveBeenCalled();
    });

    it('incrementa portalTokenVersion y firma un JWT con scope=portal_proveedor y el nuevo tokenVersion', async () => {
      const txMock = {
        proveedor: {
          findFirst: vi.fn().mockResolvedValue({ id: 'prov-1', razonSocial: 'Proveedor Uno' }),
          update: vi.fn().mockResolvedValue({ id: 'prov-1', razonSocial: 'Proveedor Uno', portalTokenVersion: 3 }),
        },
      };
      prismaMock.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      const resultado = await service.generarLink('e1', 'prov-1');

      expect(txMock.proveedor.update).toHaveBeenCalledWith({
        where: { id: 'prov-1' },
        data: { portalTokenVersion: { increment: 1 } },
      });
      expect(jwtMock.signAsync).toHaveBeenCalledWith(
        {
          sub: 'prov-1',
          empresaId: 'e1',
          scope: 'portal_proveedor',
          proveedorNombre: 'Proveedor Uno',
          tokenVersion: 3,
        },
        expect.objectContaining({ secret: process.env.PORTAL_JWT_SECRET, expiresIn: expect.any(String) }),
      );
      expect(resultado).toEqual({ token: 'jwt-firmado', proveedorId: 'prov-1', proveedorNombre: 'Proveedor Uno' });
    });
  });

  describe('misOrdenes', () => {
    it('filtra las órdenes de compra por empresaId y proveedorId del token', async () => {
      const findMany = vi.fn().mockResolvedValue([{ id: 'oc-1' }]);
      const txMock = { ordenCompra: { findMany } };
      prismaMock.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      const r = await service.misOrdenes('e1', 'prov-1');

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { empresaId: 'e1', proveedorId: 'prov-1' }, orderBy: { fecha: 'desc' } }),
      );
      expect(r).toEqual([{ id: 'oc-1' }]);
    });
  });

  describe('misFacturas', () => {
    it('filtra las facturas por empresaId y proveedorId del token', async () => {
      const findMany = vi.fn().mockResolvedValue([{ id: 'f-1' }]);
      const txMock = { facturaB2B: { findMany } };
      prismaMock.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      const r = await service.misFacturas('e1', 'prov-1');

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { empresaId: 'e1', proveedorId: 'prov-1' }, orderBy: { fecha: 'desc' } }),
      );
      expect(r).toEqual([{ id: 'f-1' }]);
    });
  });

  describe('crearFactura', () => {
    const dto = { ordenCompraId: 'oc-1', numero: 'F-001', monto: 100 } as any;

    it('rechaza con BadRequestException si la OC no existe o no pertenece a la empresa', async () => {
      prismaMock.withTenant.mockResolvedValueOnce(null);

      await expect(service.crearFactura('e1', 'prov-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('rechaza con ForbiddenException si la OC pertenece a otro proveedor', async () => {
      prismaMock.withTenant.mockResolvedValueOnce({ id: 'oc-1', proveedorId: 'prov-OTRO', estado: 'PENDIENTE' });

      await expect(service.crearFactura('e1', 'prov-1', dto)).rejects.toThrow(ForbiddenException);
    });

    it('rechaza con BadRequestException si la OC está CANCELADA', async () => {
      prismaMock.withTenant.mockResolvedValueOnce({ id: 'oc-1', proveedorId: 'prov-1', estado: 'CANCELADA' });

      await expect(service.crearFactura('e1', 'prov-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('traduce el error P2002 (factura duplicada) a BadRequestException', async () => {
      prismaMock.withTenant
        .mockResolvedValueOnce({ id: 'oc-1', proveedorId: 'prov-1', estado: 'PENDIENTE' })
        .mockImplementationOnce(() => {
          throw { code: 'P2002' };
        });

      await expect(service.crearFactura('e1', 'prov-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('propaga otros errores sin traducir', async () => {
      const otroError = new Error('fallo inesperado');
      prismaMock.withTenant
        .mockResolvedValueOnce({ id: 'oc-1', proveedorId: 'prov-1', estado: 'PENDIENTE' })
        .mockImplementationOnce(() => {
          throw otroError;
        });

      await expect(service.crearFactura('e1', 'prov-1', dto)).rejects.toBe(otroError);
    });

    it('crea la factura cuando la OC es válida y pertenece al proveedor del token', async () => {
      const create = vi.fn().mockResolvedValue({ id: 'fac-1', ...dto });
      prismaMock.withTenant
        .mockResolvedValueOnce({ id: 'oc-1', proveedorId: 'prov-1', estado: 'PENDIENTE' })
        .mockImplementationOnce((_e: string, fn: any) => fn({ facturaB2B: { create } }));

      const r = await service.crearFactura('e1', 'prov-1', dto);

      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          empresaId: 'e1',
          ordenCompraId: 'oc-1',
          proveedorId: 'prov-1',
          numero: 'F-001',
          monto: 100,
        }),
      });
      expect(r).toEqual({ id: 'fac-1', ...dto });
    });
  });
});
