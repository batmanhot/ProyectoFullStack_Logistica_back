import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CdrService } from './cdr.service';

describe('CdrService', () => {
  let prisma: any;
  let service: CdrService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new CdrService(prisma);
  });

  describe('findAll', () => {
    it('filtra solo activos por defecto', async () => {
      const txMock = { cDR: { findMany: vi.fn().mockResolvedValue([]) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.findAll('e1');
      expect(txMock.cDR.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ activo: true }) }),
      );
    });
  });

  describe('findOne', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.withTenant.mockResolvedValue(null);
      await expect(service.findOne('e1', 'x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('lanza BadRequestException en código duplicado (P2002)', async () => {
      prisma.withTenant.mockRejectedValue({ code: 'P2002' });
      await expect(service.create('e1', { codigo: 'DUP', nombre: 'X' } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove (soft-delete)', () => {
    it('marca activo=false, nunca borra la fila', async () => {
      const txMock = { cDR: { update: vi.fn().mockResolvedValue({ id: 'c1', activo: false }) } };
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'c1' })
        .mockImplementationOnce((_e: string, fn: any) => fn(txMock));
      await service.remove('e1', 'c1');
      expect(txMock.cDR.update).toHaveBeenCalledWith(expect.objectContaining({ data: { activo: false } }));
    });
  });
});
