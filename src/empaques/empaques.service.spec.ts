import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EmpaquesService } from './empaques.service';

describe('EmpaquesService', () => {
  let prismaMock: any;
  let service: EmpaquesService;

  beforeEach(() => {
    prismaMock = { withTenant: vi.fn() };
    service = new EmpaquesService(prismaMock);
  });

  describe('upsert', () => {
    it('rechaza registrar empaque en un despacho ENTREGADO', async () => {
      prismaMock.withTenant.mockResolvedValueOnce({ id: 'd1', estado: 'ENTREGADO' });

      await expect(
        service.upsert('e1', 'd1', { tipoCajaId: 'c3' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rechaza si el despacho no existe en el tenant', async () => {
      prismaMock.withTenant.mockResolvedValueOnce(null);

      await expect(
        service.upsert('e1', 'd1', { tipoCajaId: 'c3' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('crea el empaque como PENDIENTE cuando confirmar no se envía (guardar borrador)', async () => {
      const txMock = {
        empaque: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)),
        },
      };
      prismaMock.withTenant
        .mockResolvedValueOnce({ id: 'd1', estado: 'LISTO' }) // validarDespacho
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));

      const resultado = await service.upsert('e1', 'd1', { tipoCajaId: 'c3', bultos: 2 } as any);

      expect(resultado.estado).toBe('PENDIENTE');
      expect(resultado.bultos).toBe(2);
    });

    it('marca CONFIRMADO cuando confirmar=true', async () => {
      const txMock = {
        empaque: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)),
        },
      };
      prismaMock.withTenant
        .mockResolvedValueOnce({ id: 'd1', estado: 'LISTO' })
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));

      const resultado = await service.upsert('e1', 'd1', { tipoCajaId: 'c3', confirmar: true } as any);

      expect(resultado.estado).toBe('CONFIRMADO');
    });

    it('actualiza el empaque existente en vez de crear uno nuevo', async () => {
      const txMock = {
        empaque: {
          findFirst: vi.fn().mockResolvedValue({ id: 'emp-1' }),
          update: vi.fn().mockResolvedValue({ id: 'emp-1', estado: 'CONFIRMADO' }),
          create: vi.fn(),
        },
      };
      prismaMock.withTenant
        .mockResolvedValueOnce({ id: 'd1', estado: 'PICKING' })
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));

      await service.upsert('e1', 'd1', { tipoCajaId: 'c5', confirmar: true } as any);

      expect(txMock.empaque.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'emp-1' } }),
      );
      expect(txMock.empaque.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('calcula empaqueEstado="sin" cuando el despacho no tiene empaque', async () => {
      prismaMock.withTenant.mockResolvedValue([
        { id: 'd1', estado: 'LISTO', empaque: null },
      ]);

      const resultado = await service.findAll('e1');
      expect(resultado[0].empaqueEstado).toBe('sin');
    });

    it('filtra por estadoEmpaque=confirmado', async () => {
      prismaMock.withTenant.mockResolvedValue([
        { id: 'd1', estado: 'LISTO', empaque: { estado: 'CONFIRMADO' } },
        { id: 'd2', estado: 'PICKING', empaque: { estado: 'PENDIENTE' } },
      ]);

      const resultado = await service.findAll('e1', { estadoEmpaque: 'confirmado' });
      expect(resultado).toHaveLength(1);
      expect(resultado[0].id).toBe('d1');
    });
  });
});
