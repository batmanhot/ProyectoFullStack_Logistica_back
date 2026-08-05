import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProformasService } from './proformas.service';

describe('ProformasService', () => {
  let prisma: any;
  let despachosMock: any;
  let service: ProformasService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    despachosMock = { validarParaCrear: vi.fn(), crearEnTransaccion: vi.fn() };
    service = new ProformasService(prisma, despachosMock);
  });

  describe('findOne', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.withTenant.mockResolvedValue(null);
      await expect(service.findOne('e1', 'x')).rejects.toThrow(NotFoundException);
    });

    it('devuelve la proforma con items', async () => {
      prisma.withTenant.mockResolvedValue({ id: 'pf1', numero: 'PRO-00001', items: [] });
      expect((await service.findOne('e1', 'pf1')).numero).toBe('PRO-00001');
    });
  });

  describe('create', () => {
    const dto = {
      clienteId: 'cli1',
      items: [
        { productoId: 'prod1', descripcion: 'Laptop', cantidad: 2, precioUnitario: 1000 },
      ],
    };

    it('rechaza si el cliente no existe', async () => {
      prisma.withTenant.mockResolvedValueOnce(null); // validarCliente
      await expect(service.create('e1', dto as any)).rejects.toThrow(BadRequestException);
    });

    it('rechaza si algún producto no existe', async () => {
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'cli1' })  // validarCliente
        .mockResolvedValueOnce([]);               // validarProductos → findMany sin resultados
      await expect(service.create('e1', dto as any)).rejects.toThrow(BadRequestException);
    });

    it('crea la proforma con subtotal, igv y total calculados', async () => {
      const txMock = {
        proforma: {
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue({ id: 'pf2', subtotal: 2000, igv: 360, total: 2360, items: [] }),
        },
      };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'cli1' })       // validarCliente
        .mockResolvedValueOnce([{ id: 'prod1' }])    // validarProductos
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));

      const r = await service.create('e1', dto as any);
      expect(r.igv).toBe(360);
      expect(r.total).toBe(2360);
    });

    it('genera número correlativo PRO-00001 si no hay proformas previas', async () => {
      const createMock = vi.fn().mockResolvedValue({ id: 'pf1', items: [] });
      const txMock = {
        proforma: { count: vi.fn().mockResolvedValue(0), create: createMock },
      };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'cli1' })
        .mockResolvedValueOnce([{ id: 'prod1' }])
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));

      await service.create('e1', dto as any);
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ numero: 'PRO-00001' }) }),
      );
    });
  });

  describe('update', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.withTenant.mockResolvedValueOnce(null);
      await expect(service.update('e1', 'x', {})).rejects.toThrow(NotFoundException);
    });

    it('lanza ForbiddenException si la proforma ya está ACEPTADA', async () => {
      prisma.withTenant.mockResolvedValueOnce({ id: 'pf1', estado: 'ACEPTADA' });
      await expect(service.update('e1', 'pf1', {})).rejects.toThrow(ForbiddenException);
    });

    it('lanza ForbiddenException si la proforma ya está RECHAZADA', async () => {
      prisma.withTenant.mockResolvedValueOnce({ id: 'pf1', estado: 'RECHAZADA' });
      await expect(service.update('e1', 'pf1', {})).rejects.toThrow(ForbiddenException);
    });

    it('actualiza notas en proforma PENDIENTE', async () => {
      const txMock = {
        proforma: { update: vi.fn().mockResolvedValue({ id: 'pf1', notas: 'Urgente', items: [] }) },
      };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'pf1', estado: 'PENDIENTE', items: [] }) // findOne
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));
      const r = await service.update('e1', 'pf1', { notas: 'Urgente' });
      expect(r.notas).toBe('Urgente');
    });
  });

  describe('convertirADespacho', () => {
    it('rechaza si la proforma no está ACEPTADA', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ estado: 'ENVIADA' } as any);
      await expect(
        service.convertirADespacho('e1', 'pf1', { almacenId: 'alm-1' } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(despachosMock.validarParaCrear).not.toHaveBeenCalled();
    });

    it('crea un Despacho REAL vía DespachosService (en la misma transacción) y marca CONVERTIDA', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({
        id: 'pf1',
        estado: 'ACEPTADA',
        clienteId: 'cli-1',
        formaPago: 'CONTADO',
        items: [{ productoId: 'p1', cantidad: 3, precioUnitario: 10 }],
      } as any);
      despachosMock.validarParaCrear.mockResolvedValue(undefined);
      despachosMock.crearEnTransaccion.mockResolvedValue({ id: 'desp-1', numero: 'DESP-00001' });

      const txMock = {
        proforma: {
          update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ estado: data.estado, despachoId: data.despachoId })),
        },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      const resultado = await service.convertirADespacho('e1', 'pf1', { almacenId: 'alm-1' } as any);

      const dtoEsperado = expect.objectContaining({
        clienteId: 'cli-1',
        almacenId: 'alm-1',
        formaPago: 'CONTADO',
        items: [{ productoId: 'p1', cantidad: 3, precioVenta: 10 }],
      });
      expect(despachosMock.validarParaCrear).toHaveBeenCalledWith('e1', dtoEsperado);
      expect(despachosMock.crearEnTransaccion).toHaveBeenCalledWith(txMock, 'e1', dtoEsperado);
      expect(resultado.estado).toBe('CONVERTIDA');
      expect(resultado.despachoId).toBe('desp-1');
    });
  });

  describe('remove (soft-delete → RECHAZADA)', () => {
    it('marca la proforma como RECHAZADA', async () => {
      const txMock = { proforma: { update: vi.fn().mockResolvedValue({ id: 'pf1', estado: 'RECHAZADA' }) } };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'pf1', estado: 'PENDIENTE', items: [] }) // findOne
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));
      await service.remove('e1', 'pf1');
      expect(txMock.proforma.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { estado: 'RECHAZADA' } }),
      );
    });
  });
});
