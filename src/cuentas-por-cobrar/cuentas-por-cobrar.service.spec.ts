import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CuentasPorCobrarService } from './cuentas-por-cobrar.service';

describe('CuentasPorCobrarService', () => {
  let prisma: any;
  let service: CuentasPorCobrarService;

  function makeCuenta(overrides: Record<string, any> = {}) {
    return {
      id: 'cxc1',
      estado: 'PENDIENTE',
      saldo: 1000,
      monto: 1000,
      fechaVencimiento: new Date(Date.now() + 86400000 * 10), // vence en 10 días
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new CuentasPorCobrarService(prisma);
  });

  describe('findOne', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.withTenant
        .mockResolvedValueOnce(null);      // findFirst → null
      await expect(service.findOne('e1', 'x')).rejects.toThrow(NotFoundException);
    });

    it('devuelve la cuenta si existe y no está vencida', async () => {
      prisma.withTenant.mockResolvedValueOnce(makeCuenta());
      const r = await service.findOne('e1', 'cxc1');
      expect(r.id).toBe('cxc1');
    });

    it('actualiza estado a VENCIDA cuando la fecha pasó y el saldo es positivo', async () => {
      const vencida = makeCuenta({ estado: 'PENDIENTE', fechaVencimiento: new Date(Date.now() - 1000) });
      prisma.withTenant
        .mockResolvedValueOnce(vencida)  // findFirst
        .mockResolvedValueOnce({ ...vencida, estado: 'VENCIDA' }); // actualizarSiVencida → update
      const r = await service.findOne('e1', 'cxc1');
      expect(r.estado).toBe('VENCIDA');
    });
  });

  describe('create', () => {
    const dto = { clienteId: 'cli1', monto: 500, moneda: 'PEN' };

    it('rechaza si el cliente no existe', async () => {
      prisma.withTenant.mockResolvedValueOnce(null); // validarCliente
      await expect(service.create('e1', dto as any)).rejects.toThrow(BadRequestException);
    });

    it('crea la cuenta con saldo = monto y número correlativo', async () => {
      const txMock = {
        cuentaPorCobrar: {
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue({ id: 'cxc2', saldo: 500, numero: 'CXC-00001' }),
        },
      };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'cli1' })   // validarCliente
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));

      const r = await service.create('e1', dto as any);
      expect(r.numero).toBe('CXC-00001');
      expect(r.saldo).toBe(500);
    });

    it('rechaza si el despacho no existe cuando se indica despachoId', async () => {
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'cli1' })  // validarCliente
        .mockResolvedValueOnce(null);              // validarDespacho → null
      await expect(service.create('e1', { ...dto, despachoId: 'd-404' } as any))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.withTenant.mockResolvedValueOnce(null);
      await expect(service.update('e1', 'x', {})).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si la cuenta ya está COBRADA', async () => {
      prisma.withTenant.mockResolvedValueOnce(makeCuenta({ estado: 'COBRADA' }));
      await expect(service.update('e1', 'cxc1', {})).rejects.toThrow(BadRequestException);
    });

    it('actualiza notas de una cuenta PENDIENTE', async () => {
      const txMock = {
        cuentaPorCobrar: { update: vi.fn().mockResolvedValue({ id: 'cxc1', notas: 'Importante' }) },
      };
      prisma.withTenant
        .mockResolvedValueOnce(makeCuenta())  // findOne
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));
      const r = await service.update('e1', 'cxc1', { notas: 'Importante' });
      expect(r.notas).toBe('Importante');
    });
  });

  describe('registrarPago', () => {
    it('rechaza si la cuenta ya está COBRADA', async () => {
      prisma.withTenant.mockResolvedValueOnce(makeCuenta({ estado: 'COBRADA' }));
      await expect(service.registrarPago('e1', 'cxc1', { monto: 100 } as any))
        .rejects.toThrow(BadRequestException);
    });

    it('rechaza si el monto del pago supera el saldo', async () => {
      prisma.withTenant.mockResolvedValueOnce(makeCuenta({ saldo: 200 }));
      await expect(service.registrarPago('e1', 'cxc1', { monto: 500 } as any))
        .rejects.toThrow(BadRequestException);
    });

    it('registra pago parcial y actualiza saldo a PARCIAL', async () => {
      const txMock = {
        pagoCxC: { create: vi.fn().mockResolvedValue({ id: 'pago1', monto: 300 }) },
        cuentaPorCobrar: { update: vi.fn() },
      };
      prisma.withTenant
        .mockResolvedValueOnce(makeCuenta({ saldo: 1000 }))   // findOne
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));

      const r = await service.registrarPago('e1', 'cxc1', { monto: 300, metodo: 'EFECTIVO' } as any);
      expect(r.id).toBe('pago1');
      expect(txMock.cuentaPorCobrar.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ saldo: 700, estado: 'PARCIAL' }) }),
      );
    });

    it('registra pago total y actualiza estado a COBRADA', async () => {
      const txMock = {
        pagoCxC: { create: vi.fn().mockResolvedValue({ id: 'pago2', monto: 1000 }) },
        cuentaPorCobrar: { update: vi.fn() },
      };
      prisma.withTenant
        .mockResolvedValueOnce(makeCuenta({ saldo: 1000 }))
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));

      await service.registrarPago('e1', 'cxc1', { monto: 1000, metodo: 'TRANSFERENCIA' } as any);
      expect(txMock.cuentaPorCobrar.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ saldo: 0, estado: 'COBRADA' }) }),
      );
    });
  });
});
