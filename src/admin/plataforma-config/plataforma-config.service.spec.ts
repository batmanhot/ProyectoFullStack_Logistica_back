import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlataformaConfigService } from './plataforma-config.service';

describe('PlataformaConfigService', () => {
  let prisma: any;
  let service: PlataformaConfigService;
  const NODE_ENV_ORIG = process.env.NODE_ENV;
  const ALLOW_ORIG = process.env.ALLOW_DEMO_LOGIN;

  beforeEach(() => {
    prisma = {
      plataformaConfig: {
        findFirst: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: 'pc1', accesoRapidoTarjetas: false }),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'pc1', ...data })),
      },
    };
    service = new PlataformaConfigService(prisma);
  });

  afterEach(() => {
    process.env.NODE_ENV = NODE_ENV_ORIG;
    if (ALLOW_ORIG === undefined) delete process.env.ALLOW_DEMO_LOGIN;
    else process.env.ALLOW_DEMO_LOGIN = ALLOW_ORIG;
  });

  describe('get', () => {
    it('crea el singleton con defaults si no existe', async () => {
      prisma.plataformaConfig.findFirst.mockResolvedValue(null);
      const r = await service.get();
      expect(prisma.plataformaConfig.create).toHaveBeenCalledWith({ data: {} });
      expect(r).toHaveProperty('bloqueadoPorEntorno');
    });

    it('devuelve la fila existente + bloqueadoPorEntorno=false fuera de producción', async () => {
      process.env.NODE_ENV = 'test';
      prisma.plataformaConfig.findFirst.mockResolvedValue({ id: 'pc1', accesoRapidoTarjetas: true });
      const r = await service.get();
      expect(r.accesoRapidoTarjetas).toBe(true);
      expect(r.bloqueadoPorEntorno).toBe(false);
    });

    it('bloqueadoPorEntorno=true en producción sin ALLOW_DEMO_LOGIN', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.ALLOW_DEMO_LOGIN;
      prisma.plataformaConfig.findFirst.mockResolvedValue({ id: 'pc1', accesoRapidoTarjetas: true });
      const r = await service.get();
      expect(r.bloqueadoPorEntorno).toBe(true);
    });

    it('bloqueadoPorEntorno=false en producción con ALLOW_DEMO_LOGIN=true', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_DEMO_LOGIN = 'true';
      prisma.plataformaConfig.findFirst.mockResolvedValue({ id: 'pc1', accesoRapidoTarjetas: true });
      const r = await service.get();
      expect(r.bloqueadoPorEntorno).toBe(false);
    });
  });

  describe('update', () => {
    it('escribe accesoRapidoTarjetas en la fila singleton', async () => {
      prisma.plataformaConfig.findFirst.mockResolvedValue({ id: 'pc1', accesoRapidoTarjetas: false });
      const r = await service.update({ accesoRapidoTarjetas: true });
      expect(prisma.plataformaConfig.update).toHaveBeenCalledWith({
        where: { id: 'pc1' },
        data: { accesoRapidoTarjetas: true },
      });
      expect(r.accesoRapidoTarjetas).toBe(true);
    });
  });
});
