import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventarioService } from './inventario.service';

describe('InventarioService', () => {
  let prisma: any;
  let service: InventarioService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new InventarioService(prisma);
  });

  it('devuelve todos los registros sin filtros', async () => {
    prisma.withTenant.mockResolvedValue([]);
    await service.findAll('e1');
    expect(prisma.withTenant).toHaveBeenCalledOnce();
  });

  it('aplica filtro por productoId', async () => {
    const txMock = { inventario: { findMany: vi.fn().mockResolvedValue([]) } };
    prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
    await service.findAll('e1', { productoId: 'p1' });
    expect(txMock.inventario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ productoId: 'p1' }) }),
    );
  });

  it('aplica filtro por almacenId', async () => {
    const txMock = { inventario: { findMany: vi.fn().mockResolvedValue([]) } };
    prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
    await service.findAll('e1', { almacenId: 'a1' });
    expect(txMock.inventario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ almacenId: 'a1' }) }),
    );
  });

  it('sin filtros no incluye productoId ni almacenId en where', async () => {
    const txMock = { inventario: { findMany: vi.fn().mockResolvedValue([]) } };
    prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
    await service.findAll('e1');
    const callArgs = txMock.inventario.findMany.mock.calls[0][0];
    expect(callArgs.where).not.toHaveProperty('productoId');
    expect(callArgs.where).not.toHaveProperty('almacenId');
  });
});
