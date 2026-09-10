import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportacionService } from './importacion.service';

describe('ImportacionService', () => {
  let prisma: any;
  let service: ImportacionService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new ImportacionService(prisma);
  });

  describe('plantilla', () => {
    it('lanza NotFoundException si la entidad no existe', () => {
      expect(() => service.plantilla('pinguinos')).toThrow(NotFoundException);
    });

    it('devuelve columnas y requeridas para clientes', () => {
      const p = service.plantilla('clientes');
      expect(p.columnas).toContain('Razón Social');
      expect(p.requeridas).toEqual(['Razón Social']);
      expect(p.ejemplos[0].length).toBe(p.columnas.length);
    });
  });

  describe('procesar — vista previa (dryRun)', () => {
    const conExistentes = (rows: any[]) =>
      prisma.withTenant.mockImplementation((_e: string, fn: any) =>
        fn({ cliente: { findMany: vi.fn().mockResolvedValue(rows) } }),
      );

    it('marca inválida una fila sin el campo requerido', async () => {
      conExistentes([]);
      const r = await service.procesar('e1', 'clientes', [{ RUC: '20512345678' }], true);
      expect(r.filas[0].valido).toBe(false);
      expect(r.filas[0].errores.join()).toMatch(/Razón Social/i);
    });

    it('marca inválido un RUC con formato incorrecto', async () => {
      conExistentes([]);
      const r = await service.procesar('e1', 'clientes', [{ 'Razón Social': 'ACME', RUC: 'abc' }], true);
      expect(r.filas[0].valido).toBe(false);
      expect(r.filas[0].errores.join()).toMatch(/dígitos/i);
    });

    it('detecta clave duplicada dentro del lote', async () => {
      conExistentes([]);
      const filas = [
        { 'Razón Social': 'ACME', RUC: '20512345678' },
        { 'Razón Social': 'ACME 2', RUC: '20512345678' },
      ];
      const r = await service.procesar('e1', 'clientes', filas, true);
      expect(r.filas[0].valido).toBe(true);
      expect(r.filas[1].valido).toBe(false);
      expect(r.filas[1].errores.join()).toMatch(/repetido/i);
    });

    it('clasifica crear vs actualizar por RUC contra los existentes', async () => {
      conExistentes([{ id: 'c1', ruc: '20512345678', razonSocial: 'ACME viejo' }]);
      const filas = [
        { 'Razón Social': 'ACME nuevo', RUC: '20512345678' }, // existe → actualizar
        { 'Razón Social': 'Otro', RUC: '20487654321' }, // nuevo → crear
      ];
      const r = await service.procesar('e1', 'clientes', filas, true);
      expect(r.filas[0].accion).toBe('actualizar');
      expect(r.filas[0].existenteId).toBe('c1');
      expect(r.filas[1].accion).toBe('crear');
      expect(r.resumen).toMatchObject({ crear: 1, actualizar: 1, error: 0 });
    });
  });

  describe('procesar — confirmar (commit)', () => {
    it('rechaza sin escribir nada si alguna fila es inválida', async () => {
      prisma.withTenant.mockImplementation((_e: string, fn: any) =>
        fn({ cliente: { findMany: vi.fn().mockResolvedValue([]) } }),
      );
      await expect(
        service.procesar('e1', 'clientes', [{ 'Razón Social': '' }], false),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea y actualiza en una transacción y devuelve el resumen', async () => {
      const create = vi.fn().mockResolvedValue({});
      const update = vi.fn().mockResolvedValue({});
      prisma.withTenant
        .mockImplementationOnce((_e: string, fn: any) =>
          fn({ cliente: { findMany: vi.fn().mockResolvedValue([{ id: 'c1', ruc: '20512345678', razonSocial: 'X' }]) } }),
        )
        .mockImplementationOnce((_e: string, fn: any) => fn({ cliente: { create, update } }));

      const filas = [
        { 'Razón Social': 'ACME nuevo', RUC: '20512345678' }, // actualizar c1
        { 'Razón Social': 'Nuevo Cliente', RUC: '20487654321' }, // crear
      ];
      const r: any = await service.procesar('e1', 'clientes', filas, false);
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c1' } }));
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ empresaId: 'e1', razonSocial: 'Nuevo Cliente' }) }),
      );
      expect(r.resumen).toMatchObject({ creados: 1, actualizados: 1 });
    });
  });
});
