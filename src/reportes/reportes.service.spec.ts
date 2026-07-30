import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportesService } from './reportes.service';

describe('ReportesService', () => {
  let prisma: any;
  let service: ReportesService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new ReportesService(prisma);
  });

  describe('financiero', () => {
    it('retorna estructura completa con meses, totales, topRentables y valorInventario', async () => {
      const txMock = {
        movimiento: {
          findMany: vi.fn()
            .mockResolvedValueOnce([
              // SALIDA mes
              { cantidad: 5, costoUnitario: 100, producto: { precioVenta: 200 } },
            ])
            .mockResolvedValueOnce([]), // DEVOLUCION mes
        },
        ordenCompra: {
          aggregate: vi.fn().mockResolvedValue({ _sum: { total: 500 } }),
        },
        producto: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'p1', sku: 'SKU1', nombre: 'Prod 1', stockActual: 10, precioCompra: 50, precioVenta: 100 },
          ]),
        },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      const r = await service.financiero('e1', 1);

      expect(r).toHaveProperty('meses');
      expect(r).toHaveProperty('totales');
      expect(r).toHaveProperty('valorInventario');
      expect(r).toHaveProperty('topRentables');
      expect(Array.isArray(r.meses)).toBe(true);
      expect(r.meses).toHaveLength(1);
    });

    it('calcula ingresos = cantidad × precioVenta de salidas', async () => {
      const txMock = {
        movimiento: {
          findMany: vi.fn()
            .mockResolvedValueOnce([
              { cantidad: 2, costoUnitario: 100, producto: { precioVenta: 300 } },
            ])
            .mockResolvedValueOnce([]),
        },
        ordenCompra: { aggregate: vi.fn().mockResolvedValue({ _sum: { total: null } }) },
        producto: { findMany: vi.fn().mockResolvedValue([]) },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.financiero('e1', 1);
      expect(r.meses[0].ingresos).toBe(600);
    });

    it('valorInventario = stockActual × precioCompra de cada producto activo', async () => {
      const txMock = {
        movimiento: { findMany: vi.fn().mockResolvedValue([]) },
        ordenCompra: { aggregate: vi.fn().mockResolvedValue({ _sum: { total: null } }) },
        producto: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'p1', sku: 'X', nombre: 'X', stockActual: 10, precioCompra: 50, precioVenta: 100 },
            { id: 'p2', sku: 'Y', nombre: 'Y', stockActual: 5,  precioCompra: 80, precioVenta: 150 },
          ]),
        },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.financiero('e1', 1);
      // 10×50 + 5×80 = 500+400 = 900
      expect(r.valorInventario).toBe(900);
    });

    it('devuelve tendenciaIngresos null cuando no hay mes anterior', async () => {
      const txMock = {
        movimiento: { findMany: vi.fn().mockResolvedValue([]) },
        ordenCompra: { aggregate: vi.fn().mockResolvedValue({ _sum: { total: null } }) },
        producto: { findMany: vi.fn().mockResolvedValue([]) },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.financiero('e1', 1);
      expect(r.tendenciaIngresos).toBeNull();
    });
  });

  describe('kpisOperativos', () => {
    function makeDespacho(estado: string, clienteId = 'cli1', total = 1000, fechaEntregado?: Date) {
      return {
        estado,
        clienteId,
        total,
        fecha: new Date('2025-06-01'),
        fechaEntrega: new Date('2025-06-10'),
        fechaEntregado: fechaEntregado ?? null,
        cliente: { razonSocial: 'Cliente Uno' },
      };
    }

    it('devuelve estructura completa con KPIs, semanas y topClientes', async () => {
      const txMock = {
        despacho: {
          findMany: vi.fn()
            .mockResolvedValueOnce([makeDespacho('ENTREGADO')]) // período
            .mockResolvedValue([]), // 8 llamadas de semanas
        },
        movimiento: {
          count:    vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        ordenCompra: { findMany: vi.fn().mockResolvedValue([]) },
        categoria:   { findMany: vi.fn().mockResolvedValue([]) },
        producto:    { findMany: vi.fn().mockResolvedValue([]) },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));

      const r = await service.kpisOperativos('e1', 30);

      expect(r).toHaveProperty('fillRate');
      expect(r).toHaveProperty('otif');
      expect(r).toHaveProperty('tasaError');
      expect(r).toHaveProperty('perfectOrder');
      expect(r).toHaveProperty('despachosPorSemana');
      expect(r.despachosPorSemana).toHaveLength(8);
      expect(r).toHaveProperty('topClientes');
    });

    it('fillRate = 100% cuando todos los despachos son ENTREGADO', async () => {
      const txMock = {
        despacho: {
          findMany: vi.fn()
            .mockResolvedValueOnce([makeDespacho('ENTREGADO'), makeDespacho('ENTREGADO')])
            .mockResolvedValue([]),
        },
        movimiento: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
        ordenCompra: { findMany: vi.fn().mockResolvedValue([]) },
        categoria:   { findMany: vi.fn().mockResolvedValue([]) },
        producto:    { findMany: vi.fn().mockResolvedValue([]) },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.kpisOperativos('e1', 30);
      expect(r.fillRate).toBe(100);
    });

    it('fillRate = 0 cuando no hay despachos en el período', async () => {
      const txMock = {
        despacho: { findMany: vi.fn().mockResolvedValue([]) },
        movimiento: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
        ordenCompra: { findMany: vi.fn().mockResolvedValue([]) },
        categoria:   { findMany: vi.fn().mockResolvedValue([]) },
        producto:    { findMany: vi.fn().mockResolvedValue([]) },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.kpisOperativos('e1', 30);
      expect(r.fillRate).toBe(0);
      expect(r.cycleTime).toBeNull();
      expect(r.leadTimeAvg).toBeNull();
    });
  });
});
