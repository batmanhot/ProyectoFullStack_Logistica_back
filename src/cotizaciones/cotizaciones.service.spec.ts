import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CotizacionesService } from './cotizaciones.service';

const COT_BASE = {
  id: 'cot-1',
  empresaId: 'e1',
  estado: 'BORRADOR',
  items: [{ id: 'ci-1', productoId: 'prod-1', cantidad: 10 }],
  respuestas: [],
};

describe('CotizacionesService', () => {
  let prisma: any;
  let service: CotizacionesService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new CotizacionesService(prisma);
  });

  // ── findAll ────────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('devuelve todas las cotizaciones del tenant', async () => {
      const txMock = { cotizacion: { findMany: vi.fn().mockResolvedValue([COT_BASE]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.findAll('e1');
      expect(r).toHaveLength(1);
    });

    it('aplica filtro de estado cuando se pasa', async () => {
      const txMock = { cotizacion: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1', 'RESPONDIDA');
      expect(txMock.cotizacion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ estado: 'RESPONDIDA' }) }),
      );
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────
  describe('findOne', () => {
    it('devuelve la cotización si existe', async () => {
      const txMock = { cotizacion: { findFirst: vi.fn().mockResolvedValue(COT_BASE) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.findOne('e1', 'cot-1');
      expect(r.id).toBe('cot-1');
    });

    it('lanza NotFoundException si no existe', async () => {
      const txMock = { cotizacion: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.findOne('e1', 'xxx')).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────
  describe('create', () => {
    it('rechaza si un producto de los ítems no existe en el tenant', async () => {
      const txProd = { producto: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txProd));
      await expect(
        service.create('e1', { items: [{ productoId: 'prod-404', cantidad: 5 }] } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea la cotización con número correlativo RFQ-XXXXX', async () => {
      const txProd   = { producto: { findFirst: vi.fn().mockResolvedValue({ id: 'prod-1' }) } };
      const cotCreada = { id: 'cot-2', numero: 'RFQ-00001', items: [] };
      const txMain   = {
        cotizacion: {
          count:  vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(cotCreada),
        },
      };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txProd))
        .mockImplementationOnce((_e: string, fn: any) => fn(txMain));
      const r = await service.create('e1', {
        items: [{ productoId: 'prod-1', descripcion: 'Mouse inalámbrico', cantidad: 5 }],
      } as any);
      expect(txMain.cotizacion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ numero: 'RFQ-00001' }) }),
      );
      expect(r.numero).toBe('RFQ-00001');
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────
  describe('update', () => {
    it('rechaza si la cotización ya está ADJUDICADA o CANCELADA', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ ...COT_BASE, estado: 'ADJUDICADA' } as any);
      await expect(service.update('e1', 'cot-1', { notas: 'X' })).rejects.toThrow(ForbiddenException);
    });

    it('actualiza campos permitidos en estado BORRADOR', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue(COT_BASE as any);
      const txUpdate = { cotizacion: { update: vi.fn().mockResolvedValue({ ...COT_BASE, notas: 'Urgente' }) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      const r = await service.update('e1', 'cot-1', { notas: 'Urgente' });
      expect(r.notas).toBe('Urgente');
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────
  describe('remove (estado=CANCELADA)', () => {
    it('rechaza cancelar una cotización ya ADJUDICADA', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ ...COT_BASE, estado: 'ADJUDICADA' } as any);
      await expect(service.remove('e1', 'cot-1')).rejects.toThrow(ForbiddenException);
    });

    it('marca estado=CANCELADA sin borrar la fila', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue(COT_BASE as any);
      const txUpdate = { cotizacion: { update: vi.fn().mockResolvedValue({ ...COT_BASE, estado: 'CANCELADA' }) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      const r = await service.remove('e1', 'cot-1');
      expect(txUpdate.cotizacion.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { estado: 'CANCELADA' } }),
      );
    });
  });

  // ── agregarRespuesta ───────────────────────────────────────────────────────
  describe('agregarRespuesta', () => {
    it('rechaza si la cotización ya está ADJUDICADA o CANCELADA', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ ...COT_BASE, estado: 'ADJUDICADA' } as any);
      await expect(
        service.agregarRespuesta('e1', 'cot-1', { proveedorId: 'prov-1', items: [] } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rechaza si el proveedor ya respondió esta cotización', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({
        ...COT_BASE,
        respuestas: [{ id: 'r1', proveedorId: 'prov-1' }],
      } as any);
      const txProv = { proveedor: { findFirst: vi.fn().mockResolvedValue({ id: 'prov-1' }) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txProv));
      await expect(
        service.agregarRespuesta('e1', 'cot-1', { proveedorId: 'prov-1', items: [] } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('rechaza si un producto de la respuesta no estaba en los ítems solicitados', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue(COT_BASE as any);
      const txProv = { proveedor: { findFirst: vi.fn().mockResolvedValue({ id: 'prov-1' }) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txProv));
      await expect(
        service.agregarRespuesta('e1', 'cot-1', {
          proveedorId: 'prov-1',
          items: [{ productoId: 'prod-no-solicitado', precioUnitario: 5 }],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('calcula subtotal = precioUnitario × cantidad SOLICITADA', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue(COT_BASE as any);
      const txProv = { proveedor: { findFirst: vi.fn().mockResolvedValue({ id: 'prov-1' }) } };
      const txMain = {
        respuestaProveedor: {
          create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...data, items: data.items.create })),
        },
        cotizacion: { update: vi.fn() },
      };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txProv))
        .mockImplementationOnce((_e: string, fn: any) => fn(txMain));
      const r = await service.agregarRespuesta('e1', 'cot-1', {
        proveedorId: 'prov-1',
        items: [{ productoId: 'prod-1', precioUnitario: 5 }], // 5 × 10 (cantidad del ítem) = 50
      } as any);
      expect(r.total).toBe(50);
      expect(r.items[0].subtotal).toBe(50);
    });

    it('actualiza estado a RESPONDIDA cuando llega la primera respuesta (BORRADOR)', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ ...COT_BASE, estado: 'BORRADOR' } as any);
      const txProv = { proveedor: { findFirst: vi.fn().mockResolvedValue({ id: 'prov-1' }) } };
      const txMain = {
        respuestaProveedor: {
          create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...data, items: data.items.create })),
        },
        cotizacion: { update: vi.fn().mockResolvedValue({}) },
      };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txProv))
        .mockImplementationOnce((_e: string, fn: any) => fn(txMain));
      await service.agregarRespuesta('e1', 'cot-1', {
        proveedorId: 'prov-1',
        items: [{ productoId: 'prod-1', precioUnitario: 5 }],
      } as any);
      expect(txMain.cotizacion.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { estado: 'RESPONDIDA' } }),
      );
    });
  });

  // ── marcarGanadora ─────────────────────────────────────────────────────────
  describe('marcarGanadora', () => {
    it('rechaza si la respuesta no pertenece a esta cotización', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ ...COT_BASE, respuestas: [{ id: 'r1' }] } as any);
      await expect(service.marcarGanadora('e1', 'cot-1', 'r-inexistente')).rejects.toThrow(NotFoundException);
    });

    it('rechaza adjudicar una cotización CANCELADA', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({
        ...COT_BASE, estado: 'CANCELADA', respuestas: [{ id: 'r1' }],
      } as any);
      await expect(service.marcarGanadora('e1', 'cot-1', 'r1')).rejects.toThrow(ForbiddenException);
    });

    it('desmarca todas las respuestas previas antes de marcar la ganadora', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({
        ...COT_BASE, estado: 'RESPONDIDA', respuestas: [{ id: 'r1' }, { id: 'r2' }],
      } as any);
      const txMock = {
        respuestaProveedor: { updateMany: vi.fn(), update: vi.fn() },
        cotizacion: { update: vi.fn().mockResolvedValue({}) },
      };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.marcarGanadora('e1', 'cot-1', 'r2');
      expect(txMock.respuestaProveedor.updateMany).toHaveBeenCalledWith(
        { where: { cotizacionId: 'cot-1' }, data: { ganadora: false } },
      );
      expect(txMock.respuestaProveedor.update).toHaveBeenCalledWith(
        { where: { id: 'r2' }, data: { ganadora: true } },
      );
      expect(txMock.cotizacion.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { estado: 'ADJUDICADA' } }),
      );
    });
  });
});
