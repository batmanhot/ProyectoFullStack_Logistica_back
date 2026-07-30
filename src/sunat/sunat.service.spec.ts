import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SunatService } from './sunat.service';

describe('SunatService', () => {
  let prismaMock: any;
  let service: SunatService;

  beforeEach(() => {
    prismaMock = { withTenant: vi.fn() };
    service = new SunatService(prismaMock);
  });

  describe('generarDocumento', () => {
    it('rechaza si el despacho no tiene guiaNumero asignado', async () => {
      prismaMock.withTenant.mockResolvedValueOnce({ id: 'd1', guiaNumero: null, estado: 'DESPACHADO' });
      await expect(service.generarDocumento('e1', 'd1')).rejects.toThrow(BadRequestException);
    });

    it('rechaza si el despacho está CANCELADO', async () => {
      prismaMock.withTenant.mockResolvedValueOnce({ id: 'd1', guiaNumero: 'G-001', estado: 'CANCELADO' });
      await expect(service.generarDocumento('e1', 'd1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('generarJSON', () => {
    it('rechaza si el despacho no existe', async () => {
      prismaMock.withTenant.mockResolvedValueOnce(null);
      await expect(service.generarJSON('e1', 'd1')).rejects.toThrow(NotFoundException);
    });

    it('mapea correctamente unidadMedida, RUC del cliente, y numero_bultos del empaque', async () => {
      prismaMock.withTenant
        .mockResolvedValueOnce({
          id: 'd1',
          guiaNumero: 'T001-00045',
          direccionEntrega: 'Av. Siempre Viva 123',
          fecha: new Date('2026-06-01'),
          fechaDespacho: new Date('2026-06-02'),
          cliente: { ruc: '20100000001', razonSocial: 'Cliente SAC', direccion: 'Otra dir' },
          transportista: { ruc: '10456789012', nombre: 'Transportista Juan' },
          empaque: { bultos: 3, pesoTotal: 25.5 },
          items: [
            {
              cantidad: 10,
              producto: { sku: 'SKU-1', nombre: 'Producto Uno', unidadMedida: 'KG', codigoSunat: null },
            },
          ],
        })
        .mockResolvedValueOnce({ ruc: '20999999999', nombre: 'Mi Empresa SAC', direccion: 'Sede principal' });

      const json = await service.generarJSON('e1', 'd1');

      expect(json.ruc_remitente).toBe('20999999999');
      expect(json.correlativo).toBe('00045');
      expect(json.numero_bultos).toBe(3);
      expect(json.peso_bruto_total).toBe(25.5);
      expect(json.transportista.numero_documento).toBe('10456789012');
      expect(json.destinatario.tipo_documento).toBe('6'); // RUC de 11 digitos
      expect(json.destinatario.numero_documento).toBe('20100000001');
      expect(json.items[0].unidad_medida).toBe('KGM'); // KG -> KGM
      expect(json.items[0].codigo).toBe('SKU-1');
    });
  });

  describe('transiciones de estado', () => {
    it('rechaza marcarEnviado si el documento no está PENDIENTE', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ id: 'g1', estado: 'ACEPTADO' } as any);
      await expect(service.marcarEnviado('e1', 'd1')).rejects.toThrow(ForbiddenException);
    });

    it('rechaza marcarAceptado si el documento no está ENVIADO', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ id: 'g1', estado: 'PENDIENTE' } as any);
      await expect(service.marcarAceptado('e1', 'd1', {} as any)).rejects.toThrow(ForbiddenException);
    });

    it('rechaza marcarRechazado si el documento no está ENVIADO', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({ id: 'g1', estado: 'RECHAZADO' } as any);
      await expect(service.marcarRechazado('e1', 'd1', { motivo: 'x' } as any)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
