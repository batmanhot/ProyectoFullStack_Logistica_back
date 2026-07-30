import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LandingService } from './landing.service';

describe('LandingService', () => {
  let prisma: any;
  let service: LandingService;

  beforeEach(() => {
    prisma = {
      landingConfig: {
        findFirst: vi.fn(),
        create:    vi.fn().mockResolvedValue({ id: 'lc1', data: {} }),
        update:    vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'lc1', ...data })),
      },
    };
    service = new LandingService(prisma);
  });

  describe('get', () => {
    it('devuelve la config existente si ya existe', async () => {
      prisma.landingConfig.findFirst.mockResolvedValue({ id: 'lc1', data: { titulo: 'Hola' } });
      const r = await service.get();
      expect(r.data).toEqual({ titulo: 'Hola' });
      expect(prisma.landingConfig.create).not.toHaveBeenCalled();
    });

    it('crea una config vacía si no existe ninguna (singleton)', async () => {
      prisma.landingConfig.findFirst.mockResolvedValue(null);
      await service.get();
      expect(prisma.landingConfig.create).toHaveBeenCalledWith({ data: { data: {} } });
    });
  });

  describe('upsert', () => {
    it('actualiza la config si ya existe', async () => {
      const nuevoData = { titulo: 'StockPro', slogan: 'Tu logística, simplificada' };
      prisma.landingConfig.findFirst.mockResolvedValue({ id: 'lc1' });
      await service.upsert({ data: nuevoData } as any);
      expect(prisma.landingConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'lc1' }, data: { data: nuevoData } }),
      );
      expect(prisma.landingConfig.create).not.toHaveBeenCalled();
    });

    it('crea la config si no existe (primer upsert)', async () => {
      const nuevoData = { titulo: 'StockPro' };
      prisma.landingConfig.findFirst.mockResolvedValue(null);
      await service.upsert({ data: nuevoData } as any);
      expect(prisma.landingConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { data: nuevoData } }),
      );
    });
  });
});
