import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FacturasB2BService } from './facturas-b2b.service';

const FACTURA_BASE = {
  id: 'f1', empresaId: 'e1', numero: 'F001-001',
  estado: 'ENVIADA', ordenCompraId: 'oc-1', proveedorId: 'prov-1',
};

describe('FacturasB2BService', () => {
  let prisma: any;
  let service: FacturasB2BService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new FacturasB2BService(prisma);
  });

  // ── findAll ────────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('devuelve todas las facturas del tenant', async () => {
      const txMock = { facturaB2B: { findMany: vi.fn().mockResolvedValue([FACTURA_BASE]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.findAll('e1');
      expect(r).toHaveLength(1);
    });

    it('aplica filtro de proveedorId y estado', async () => {
      const txMock = { facturaB2B: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1', { proveedorId: 'prov-1', estado: 'RECIBIDA' });
      expect(txMock.facturaB2B.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ proveedorId: 'prov-1', estado: 'RECIBIDA' }) }),
      );
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────
  describe('findOne', () => {
    it('devuelve la factura si existe', async () => {
      const txMock = { facturaB2B: { findFirst: vi.fn().mockResolvedValue(FACTURA_BASE) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      const r = await service.findOne('e1', 'f1');
      expect(r.numero).toBe('F001-001');
    });

    it('lanza NotFoundException si no existe', async () => {
      const txMock = { facturaB2B: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await expect(service.findOne('e1', 'xxx')).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────
  describe('create', () => {
    it('rechaza si la orden de compra no existe en el tenant', async () => {
      const txOC = { ordenCompra: { findFirst: vi.fn().mockResolvedValue(null) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txOC));
      await expect(
        service.create('e1', { ordenCompraId: 'oc-404', numero: 'F001-001' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza si la orden de compra está CANCELADA', async () => {
      const txOC = { ordenCompra: { findFirst: vi.fn().mockResolvedValue({ id: 'oc-1', estado: 'CANCELADA', proveedorId: 'prov-1' }) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txOC));
      await expect(
        service.create('e1', { ordenCompraId: 'oc-1', numero: 'F001-001' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea la factura y hereda proveedorId de la OC', async () => {
      const orden = { id: 'oc-1', estado: 'RECIBIDA', proveedorId: 'prov-1' };
      const txOC  = { ordenCompra: { findFirst: vi.fn().mockResolvedValue(orden) } };
      const txCr  = { facturaB2B: { create: vi.fn().mockResolvedValue({ ...FACTURA_BASE }) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txOC))
        .mockImplementationOnce((_e: string, fn: any) => fn(txCr));
      const r = await service.create('e1', { ordenCompraId: 'oc-1', numero: 'F001-001', monto: 1000 } as any);
      expect(txCr.facturaB2B.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ proveedorId: 'prov-1', monto: 1000 }) }),
      );
      expect(r.numero).toBe('F001-001');
    });

    it('traduce P2002 (OC ya tiene factura) a BadRequestException', async () => {
      const txOC = { ordenCompra: { findFirst: vi.fn().mockResolvedValue({ id: 'oc-1', estado: 'RECIBIDA', proveedorId: 'prov-1' }) } };
      const txCr = { facturaB2B: { create: vi.fn().mockRejectedValue({ code: 'P2002' }) } };
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) => fn(txOC))
        .mockImplementationOnce((_e: string, fn: any) => fn(txCr));
      await expect(
        service.create('e1', { ordenCompraId: 'oc-1', numero: 'F001-001' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── marcarRecibida ─────────────────────────────────────────────────────────
  describe('marcarRecibida', () => {
    it('rechaza si la factura no está en ENVIADA', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ ...FACTURA_BASE, estado: 'RECIBIDA' } as any);
      await expect(service.marcarRecibida('e1', 'f1')).rejects.toThrow(ForbiddenException);
    });

    it('cambia estado a RECIBIDA', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue(FACTURA_BASE as any);
      const txUpdate = { facturaB2B: { update: vi.fn().mockResolvedValue({ ...FACTURA_BASE, estado: 'RECIBIDA' }) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      const r = await service.marcarRecibida('e1', 'f1');
      expect(txUpdate.facturaB2B.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { estado: 'RECIBIDA' } }),
      );
    });
  });

  // ── rechazar ───────────────────────────────────────────────────────────────
  describe('rechazar', () => {
    it('rechaza si la factura no está en ENVIADA', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ ...FACTURA_BASE, estado: 'RECHAZADA' } as any);
      await expect(service.rechazar('e1', 'f1', {} as any)).rejects.toThrow(ForbiddenException);
    });

    it('cambia estado a RECHAZADA y guarda el motivo', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue(FACTURA_BASE as any);
      const txUpdate = { facturaB2B: { update: vi.fn().mockResolvedValue({ ...FACTURA_BASE, estado: 'RECHAZADA', notas: 'Monto incorrecto' }) } };
      prisma.withTenant.mockImplementationOnce((_e: string, fn: any) => fn(txUpdate));
      await service.rechazar('e1', 'f1', { motivo: 'Monto incorrecto' });
      expect(txUpdate.facturaB2B.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ estado: 'RECHAZADA', notas: 'Monto incorrecto' }) }),
      );
    });
  });
});
