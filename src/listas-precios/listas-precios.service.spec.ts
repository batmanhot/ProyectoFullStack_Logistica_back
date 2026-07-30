import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ListasPreciosService } from './listas-precios.service';

function makeTx(overrides: any = {}) {
  return {
    listaPrecios: {
      findMany:  vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create:    vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'lp-new', ...data })),
      update:    vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'lp1', ...data })),
      delete:    vi.fn().mockResolvedValue({ id: 'lp1' }),
    },
    ...overrides,
  };
}

describe('ListasPreciosService', () => {
  let prisma: any;
  let service: ListasPreciosService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new ListasPreciosService(prisma);
  });

  describe('findOne', () => {
    it('devuelve la lista si existe', async () => {
      prisma.withTenant.mockResolvedValue({ id: 'lp1', nombre: 'General' });
      expect((await service.findOne('e1', 'lp1')).nombre).toBe('General');
    });

    it('lanza NotFoundException si no existe', async () => {
      prisma.withTenant.mockResolvedValue(null);
      await expect(service.findOne('e1', 'x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('usa defaults cuando el DTO omite campos opcionales', async () => {
      const tx = makeTx();
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await service.create('e1', { nombre: 'Mayorista' } as any);
      expect(tx.listaPrecios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tipo: 'general', descuento: 0, markup: 0, activa: true }),
        }),
      );
    });

    it('respeta los campos del DTO cuando se proveen', async () => {
      const tx = makeTx();
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(tx));
      await service.create('e1', { nombre: 'VIP', tipo: 'especial', descuento: 20, markup: 0, activa: false } as any);
      expect(tx.listaPrecios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tipo: 'especial', descuento: 20, activa: false }),
        }),
      );
    });
  });

  describe('update', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.withTenant.mockResolvedValueOnce(null);
      await expect(service.update('e1', 'x', {})).rejects.toThrow(NotFoundException);
    });

    it('actualiza campos parcialmente', async () => {
      const tx = makeTx();
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'lp1', nombre: 'Viejo' })   // findOne
        .mockImplementationOnce((_e: string, fn: any) => fn(tx)); // update
      await service.update('e1', 'lp1', { nombre: 'Nuevo' });
      expect(tx.listaPrecios.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ nombre: 'Nuevo' }) }),
      );
    });
  });

  describe('remove', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.withTenant.mockResolvedValueOnce(null);
      await expect(service.remove('e1', 'x')).rejects.toThrow(NotFoundException);
    });

    it('llama delete físico (listas de precios se pueden eliminar)', async () => {
      const tx = makeTx();
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'lp1' })
        .mockImplementationOnce((_e: string, fn: any) => fn(tx));
      await service.remove('e1', 'lp1');
      expect(tx.listaPrecios.delete).toHaveBeenCalled();
    });
  });

  describe('setPrecioProducto', () => {
    it('inserta un precio especial para un producto', async () => {
      const tx = makeTx();
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'lp1', precios: {} })                  // findOne
        .mockImplementationOnce((_e: string, fn: any) => fn(tx));            // update
      await service.setPrecioProducto('e1', 'lp1', 'prod-1', 49.99);
      expect(tx.listaPrecios.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { precios: { 'prod-1': 49.99 } } }),
      );
    });

    it('elimina el precio especial cuando precio es null', async () => {
      const tx = makeTx();
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'lp1', precios: { 'prod-1': 49.99, 'prod-2': 99 } })
        .mockImplementationOnce((_e: string, fn: any) => fn(tx));
      await service.setPrecioProducto('e1', 'lp1', 'prod-1', null);
      const precios = tx.listaPrecios.update.mock.calls[0][0].data.precios;
      expect(precios).not.toHaveProperty('prod-1');
      expect(precios['prod-2']).toBe(99);
    });
  });

  describe('duplicar', () => {
    it('crea una copia con nombre "(copia)" y activa=true', async () => {
      const tx = makeTx();
      prisma.withTenant
        .mockResolvedValueOnce({ id: 'lp1', nombre: 'Mayorista', tipo: 'mayorista', descuento: 15, markup: 0, precios: {} })
        .mockImplementationOnce((_e: string, fn: any) => fn(tx));
      await service.duplicar('e1', 'lp1');
      expect(tx.listaPrecios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ nombre: 'Mayorista (copia)', activa: true, descuento: 15 }),
        }),
      );
    });
  });
});
