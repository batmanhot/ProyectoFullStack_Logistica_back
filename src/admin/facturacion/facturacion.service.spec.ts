import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FacturacionService, estadoEfectivoFactura } from './facturacion.service';

const dia = 86_400_000;

describe('estadoEfectivoFactura', () => {
  it('deriva "vencida" para una EMITIDA cuyo vencimiento ya pasó', () => {
    expect(estadoEfectivoFactura({ estado: 'EMITIDA', venceEn: new Date(Date.now() - dia) })).toBe('vencida');
  });
  it('deja "emitida" si el vencimiento es futuro', () => {
    expect(estadoEfectivoFactura({ estado: 'EMITIDA', venceEn: new Date(Date.now() + dia) })).toBe('emitida');
  });
  it('pasa PAGADA / ANULADA tal cual (en minúscula)', () => {
    expect(estadoEfectivoFactura({ estado: 'PAGADA', venceEn: new Date(Date.now() - dia) })).toBe('pagada');
    expect(estadoEfectivoFactura({ estado: 'ANULADA', venceEn: new Date(Date.now() - dia) })).toBe('anulada');
  });
});

describe('FacturacionService', () => {
  let prisma: any;
  let service: FacturacionService;

  beforeEach(() => {
    prisma = {
      empresa: { findUnique: vi.fn() },
      planSaaS: { findUnique: vi.fn() },
      renovacionPlan: { findUnique: vi.fn(), update: vi.fn() },
      facturaSaaS: {
        findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(),
        groupBy: vi.fn(), aggregate: vi.fn(),
      },
      eventoFacturaSaaS: { findMany: vi.fn() },
      $transaction: vi.fn((ops: any[]) => Promise.all(ops)),
    };
    service = new FacturacionService(prisma);
  });

  describe('emitir', () => {
    const dtoBase = { empresaId: 'e1', planId: 'profesional', subtotal: 100, venceEn: new Date(Date.now() + 30 * dia).toISOString() };

    beforeEach(() => {
      prisma.empresa.findUnique.mockResolvedValue({ id: 'e1', nombre: 'Cliente A' });
      prisma.planSaaS.findUnique.mockResolvedValue({ id: 'profesional', nombre: 'Profesional' });
      prisma.facturaSaaS.count.mockResolvedValue(0);
      prisma.facturaSaaS.create.mockImplementation(({ data }: any) => ({
        estado: 'EMITIDA', ...data, id: 'f1',
        empresa: { nombre: 'Cliente A', codigo: 'cliente-a', ruc: '20x' }, plan: { nombre: 'Profesional' },
      }));
    });

    it('calcula IGV 18% y total, y snapshotea el nombre del plan', async () => {
      const res = await service.emitir(dtoBase as any);
      const data = prisma.facturaSaaS.create.mock.calls[0][0].data;
      expect(data.subtotal).toBe(100);
      expect(data.igv).toBe(18);
      expect(data.total).toBe(118);
      expect(data.planNombre).toBe('Profesional');
      expect(res.total).toBe(118);
    });

    it('genera el correlativo FAC-001001 para la primera factura', async () => {
      await service.emitir(dtoBase as any);
      expect(prisma.facturaSaaS.create.mock.calls[0][0].data.numero).toBe('FAC-001001');
    });

    it('rechaza si la empresa no existe', async () => {
      prisma.empresa.findUnique.mockResolvedValue(null);
      await expect(service.emitir(dtoBase as any)).rejects.toThrow(/empresa/i);
    });

    it('rechaza si el vencimiento es anterior a la emisión', async () => {
      const dto = { ...dtoBase, emitidaEn: new Date(Date.now()).toISOString(), venceEn: new Date(Date.now() - 5 * dia).toISOString() };
      await expect(service.emitir(dto as any)).rejects.toThrow(/vencimiento/i);
    });

    it('rechaza una renovación de otro negocio', async () => {
      prisma.renovacionPlan.findUnique.mockResolvedValue({ empresaId: 'otro' });
      await expect(service.emitir({ ...dtoBase, renovacionId: 'r9' } as any)).rejects.toThrow(/otro negocio/i);
    });
  });

  describe('registrarCobro', () => {
    it('rechaza si la factura ya está pagada', async () => {
      prisma.facturaSaaS.findUnique.mockResolvedValue({ id: 'f1', estado: 'PAGADA', total: 118, renovacionId: null });
      await expect(service.registrarCobro('f1', { metodoPago: 'transferencia', referenciaPago: 'OP-1' })).rejects.toThrow(/ya está cobrada/i);
    });

    it('rechaza si la factura está anulada', async () => {
      prisma.facturaSaaS.findUnique.mockResolvedValue({ id: 'f1', estado: 'ANULADA', total: 118, renovacionId: null });
      await expect(service.registrarCobro('f1', { metodoPago: 'transferencia', referenciaPago: 'OP-1' })).rejects.toThrow(/anulado/i);
    });

    it('marca PAGADA y concilia la renovación vinculada si estaba pendiente', async () => {
      prisma.facturaSaaS.findUnique
        .mockResolvedValueOnce({ id: 'f1', estado: 'EMITIDA', total: 118, renovacionId: 'r1', renovacion: { estado: 'PENDIENTE' } })
        .mockResolvedValueOnce({ id: 'f1', estado: 'PAGADA', venceEn: new Date(), subtotal: 100, igv: 18, total: 118, empresa: {}, plan: {}, eventos: [] });
      await service.registrarCobro('f1', { metodoPago: 'transferencia', referenciaPago: 'OP-1' });
      expect(prisma.facturaSaaS.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'f1' } }));
      expect(prisma.renovacionPlan.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { estado: 'PAGADO' } });
    });

    it('NO toca la renovación si ya estaba pagada', async () => {
      prisma.facturaSaaS.findUnique
        .mockResolvedValueOnce({ id: 'f1', estado: 'EMITIDA', total: 118, renovacionId: 'r1', renovacion: { estado: 'PAGADO' } })
        .mockResolvedValueOnce({ id: 'f1', estado: 'PAGADA', venceEn: new Date(), subtotal: 100, igv: 18, total: 118, empresa: {}, plan: {}, eventos: [] });
      await service.registrarCobro('f1', { metodoPago: 'transferencia', referenciaPago: 'OP-1' });
      expect(prisma.renovacionPlan.update).not.toHaveBeenCalled();
    });
  });

  describe('anular', () => {
    it('rechaza anular una factura ya cobrada', async () => {
      prisma.facturaSaaS.findUnique.mockResolvedValue({ id: 'f1', estado: 'PAGADA', total: 118 });
      await expect(service.anular('f1')).rejects.toThrow(/cobrada/i);
    });
  });

  describe('resumen', () => {
    it('excluye anuladas del facturado y suma cobrado / vencido por separado', async () => {
      // groupBy por estado: PAGADA 100, EMITIDA 80 (50 vigente + 30 vencida), ANULADA 999
      prisma.facturaSaaS.groupBy.mockResolvedValue([
        { estado: 'PAGADA', _sum: { total: 100 }, _count: 1 },
        { estado: 'EMITIDA', _sum: { total: 80 }, _count: 2 },
        { estado: 'ANULADA', _sum: { total: 999 }, _count: 1 },
      ]);
      // aggregate de las vencidas (EMITIDA + venceEn < now)
      prisma.facturaSaaS.aggregate.mockResolvedValue({ _sum: { total: 30 }, _count: 1 });

      const r = await service.resumen();
      expect(r.facturado).toBe(180); // 100 + 80, sin la anulada
      expect(r.cobrado).toBe(100);
      expect(r.porCobrar).toBe(80);
      expect(r.vencido).toBe(30);
      expect(r.vencidas).toBe(1);
      expect(r.pendientes).toBe(2);
    });
  });
});
