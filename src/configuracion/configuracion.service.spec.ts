import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ConfiguracionService } from './configuracion.service';

describe('ConfiguracionService', () => {
  let prisma: any;
  let service: ConfiguracionService;

  beforeEach(() => {
    prisma = {
      empresa: {
        findUnique: vi.fn(),
        update:     vi.fn(),
      },
      planSaaS: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    service = new ConfiguracionService(prisma);
  });

  describe('findOne', () => {
    it('devuelve los datos públicos de la empresa', async () => {
      const empresa = { id: 'e1', nombre: 'Acme SAC', ruc: '20123456789', contacto: 'Ana', email: 'info@acme.com', telefono: '999', direccion: 'Jr. Lima 123', plan: 'pro' };
      prisma.empresa.findUnique.mockResolvedValue(empresa);
      const r = await service.findOne('e1');
      expect(r.nombre).toBe('Acme SAC');
      expect(r.ruc).toBe('20123456789');
    });

    it('lanza NotFoundException si la empresa no existe', async () => {
      prisma.empresa.findUnique.mockResolvedValue(null);
      await expect(service.findOne('e1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('verifica que la empresa existe antes de actualizar', async () => {
      prisma.empresa.findUnique.mockResolvedValue(null);
      await expect(service.update('e1', { nombre: 'Nuevo' } as any)).rejects.toThrow(NotFoundException);
      expect(prisma.empresa.update).not.toHaveBeenCalled();
    });

    it('actualiza los campos y devuelve los datos públicos', async () => {
      const empresaActual = { id: 'e1', nombre: 'Viejo', ruc: '20111', contacto: '', email: '', telefono: '', direccion: '', plan: 'basic' };
      prisma.empresa.findUnique.mockResolvedValue(empresaActual);
      prisma.empresa.update.mockResolvedValue({ ...empresaActual, nombre: 'Nuevo Nombre' });
      const r = await service.update('e1', { nombre: 'Nuevo Nombre' } as any);
      expect(r.nombre).toBe('Nuevo Nombre');
      expect(prisma.empresa.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'e1' }, data: { nombre: 'Nuevo Nombre' } }),
      );
    });
  });
});
