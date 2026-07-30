import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditoriaService } from './auditoria.service';

describe('AuditoriaService', () => {
  let prisma: any;
  let service: AuditoriaService;

  beforeEach(() => {
    prisma = { withTenant: vi.fn() };
    service = new AuditoriaService(prisma);
  });

  describe('findAll', () => {
    it('llama withTenant y devuelve array de registros', async () => {
      const logs = [{ id: 'a1', accion: 'CREAR', modulo: 'Productos' }];
      prisma.withTenant.mockResolvedValue(logs);
      const r = await service.findAll('e1');
      expect(r).toEqual(logs);
    });

    it('acepta filtros opcionales sin lanzar error', async () => {
      prisma.withTenant.mockResolvedValue([]);
      const r = await service.findAll('e1', {
        accion: 'EDITAR',
        modulo: 'Clientes',
        busqueda: 'Ana',
        desde: '2025-01-01',
        hasta: '2025-12-31',
      });
      expect(Array.isArray(r)).toBe(true);
    });
  });

  describe('registrar', () => {
    it('crea un registro de auditoría con los datos provistos', async () => {
      const txMock = { auditoria: { create: vi.fn().mockResolvedValue({ id: 'a2' }) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.registrar('e1', {
        usuarioNombre: 'Admin',
        accion: 'CREAR',
        modulo: 'Productos',
        detalle: 'Creó producto SKU-001',
      });
      expect(txMock.auditoria.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ accion: 'CREAR', modulo: 'Productos', empresaId: 'e1' }),
        }),
      );
    });
  });

  describe('limpiar', () => {
    it('llama deleteMany con el empresaId correcto', async () => {
      const txMock = { auditoria: { deleteMany: vi.fn().mockResolvedValue({ count: 50 }) } };
      prisma.withTenant.mockImplementation((_e: string, fn: any) => fn(txMock));
      await service.limpiar('e1');
      expect(txMock.auditoria.deleteMany).toHaveBeenCalledWith({ where: { empresaId: 'e1' } });
    });
  });
});
