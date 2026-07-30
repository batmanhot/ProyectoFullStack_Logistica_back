import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PortalService } from './portal.service';

describe('PortalService', () => {
  let prismaMock: any;
  let jwtMock: any;
  let despachosMock: any;
  let service: PortalService;

  beforeEach(() => {
    prismaMock = {
      withTenant: vi.fn(),
      empresa: { findUnique: vi.fn().mockResolvedValue({ nombre: 'Empresa Demo' }) },
    };
    jwtMock = { signAsync: vi.fn().mockResolvedValue('jwt-firmado') };
    despachosMock = { create: vi.fn(), validarParaCrear: vi.fn(), crearEnTransaccion: vi.fn() };
    service = new PortalService(prismaMock, jwtMock, despachosMock);
  });

  describe('generarLink', () => {
    it('rechaza si el cliente no existe en el tenant', async () => {
      prismaMock.withTenant.mockResolvedValue(null);
      await expect(service.generarLink('e1', 'cli-1')).rejects.toThrow();
    });

    it('firma un JWT con scope=portal_cliente, clienteNombre, empresaNombre y secreto propio', async () => {
      prismaMock.withTenant.mockResolvedValue({ id: 'cli-1', razonSocial: 'Cliente Uno' });

      const resultado = await service.generarLink('e1', 'cli-1');

      expect(jwtMock.signAsync).toHaveBeenCalledWith(
        { sub: 'cli-1', empresaId: 'e1', scope: 'portal_cliente', clienteNombre: 'Cliente Uno', empresaNombre: 'Empresa Demo' },
        expect.objectContaining({ secret: process.env.PORTAL_JWT_SECRET, expiresIn: expect.any(String) }),
      );
      expect(resultado.token).toBe('jwt-firmado');
      expect(resultado.clienteNombre).toBe('Cliente Uno');
    });
  });

  describe('crearPedido', () => {
    it('rechaza si algún producto no existe o no está activo', async () => {
      prismaMock.withTenant.mockResolvedValueOnce([{ id: 'p1', precioVenta: 10, nombre: 'Prod 1' }]); // solo 1 de 2

      await expect(
        service.crearPedido('e1', 'cli-1', {
          items: [{ productoId: 'p1', cantidad: 2 }, { productoId: 'p2', cantidad: 1 }],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza si un producto no tiene precio de venta publicado', async () => {
      prismaMock.withTenant.mockResolvedValueOnce([{ id: 'p1', precioVenta: 0, nombre: 'Sin precio' }]);

      await expect(
        service.crearPedido('e1', 'cli-1', { items: [{ productoId: 'p1', cantidad: 2 }] } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('calcula subtotal/igv/total con snapshot del precio actual', async () => {
      const txMock = {
        pedidoPortal: {
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)),
        },
      };
      prismaMock.withTenant
        .mockResolvedValueOnce([{ id: 'p1', precioVenta: 10, nombre: 'Prod 1' }]) // findMany productos
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));

      const resultado = await service.crearPedido('e1', 'cli-1', {
        items: [{ productoId: 'p1', cantidad: 3 }],
      } as any);

      expect(resultado.subtotal).toBe(30);
      expect(resultado.igv).toBe(5.4);
      expect(resultado.total).toBe(35.4);
    });
  });

  describe('aprobarYConvertir', () => {
    it('rechaza si el pedido no está en NUEVO', async () => {
      vi.spyOn(service, 'findOneAdmin').mockResolvedValue({ estado: 'CONVERTIDO' } as any);
      await expect(
        service.aprobarYConvertir('e1', 'pp1', { almacenId: 'alm-1' } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(despachosMock.validarParaCrear).not.toHaveBeenCalled();
    });

    it('crea un Despacho REAL vía DespachosService (en la misma transacción) y marca CONVERTIDO', async () => {
      vi.spyOn(service, 'findOneAdmin').mockResolvedValue({
        id: 'pp1',
        estado: 'NUEVO',
        clienteId: 'cli-1',
        observaciones: 'Entregar en la tarde',
        fechaEntregaDeseada: null,
        items: [{ productoId: 'p1', cantidad: 3, precioUnitario: 10 }],
      } as any);
      despachosMock.validarParaCrear.mockResolvedValue(undefined);
      despachosMock.crearEnTransaccion.mockResolvedValue({ id: 'desp-1', numero: 'DESP-00001' });

      const txMock = {
        pedidoPortal: {
          update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ estado: data.estado, despachoId: data.despachoId })),
        },
      };
      prismaMock.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      const resultado = await service.aprobarYConvertir('e1', 'pp1', { almacenId: 'alm-1' } as any);

      const dtoEsperado = expect.objectContaining({
        clienteId: 'cli-1',
        almacenId: 'alm-1',
        items: [{ productoId: 'p1', cantidad: 3, precioVenta: 10 }],
      });
      expect(despachosMock.validarParaCrear).toHaveBeenCalledWith('e1', dtoEsperado);
      expect(despachosMock.crearEnTransaccion).toHaveBeenCalledWith(txMock, 'e1', dtoEsperado);
      expect(resultado.estado).toBe('CONVERTIDO');
      expect(resultado.despachoId).toBe('desp-1');
    });
  });

  describe('rechazar', () => {
    it('rechaza si el pedido no está en NUEVO', async () => {
      vi.spyOn(service, 'findOneAdmin').mockResolvedValue({ estado: 'APROBADO' } as any);
      await expect(service.rechazar('e1', 'pp1', { motivo: 'Sin stock' } as any)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
