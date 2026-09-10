import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BackupsService } from './backups.service';

describe('BackupsService', () => {
  let prisma: any;
  let service: BackupsService;

  beforeEach(() => {
    prisma = {
      empresa: { findUnique: vi.fn(), findMany: vi.fn() },
      respaldoNegocio: { findUnique: vi.fn(), findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
      solicitudRestauracion: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
      eventoRespaldo: { findMany: vi.fn(), create: vi.fn() },
      pruebaRestauracion: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
      $transaction: vi.fn((ops: any[]) => Promise.all(ops)),
    };
    service = new BackupsService(prisma);
  });

  describe('ingestarRespaldo', () => {
    it('respaldo de plataforma (sin empresaId) → origen automatico, estado COMPLETADO por defecto', async () => {
      prisma.respaldoNegocio.create.mockImplementation(({ data }: any) => ({
        ...data, id: 'b9', empresa: null, createdAt: new Date(),
      }));
      const r = await service.ingestarRespaldo({ alcance: 'plataforma_completa', formato: 'pg_dump', storageKey: 'k/2026.dump.age' } as any);
      const data = prisma.respaldoNegocio.create.mock.calls[0][0].data;
      expect(data.empresaId).toBeNull();
      expect(data.origen).toBe('automatico');
      expect(data.estado).toBe('COMPLETADO');
      expect(data.creadoPor).toBe('sistema (job de backup)');
      expect(data.storageKey).toBe('k/2026.dump.age');
      expect(r.esPlataforma).toBe(true);
      expect(r.empresaNombre).toBe('Toda la plataforma');
    });

    it('respaldo de tenant → valida que el negocio exista', async () => {
      prisma.empresa.findUnique.mockResolvedValue(null);
      await expect(
        service.ingestarRespaldo({ empresaId: 'noexiste', alcance: 'base_datos', formato: 'json_tenant', storageKey: 'k' } as any),
      ).rejects.toThrow(/no existe/i);
    });

    it('registrarPruebaRestauracion crea la fila y un evento', async () => {
      prisma.pruebaRestauracion.create.mockResolvedValue({ id: 'p1', resultado: 'ok' });
      await service.registrarPruebaRestauracion({ resultado: 'ok', dumpProbado: 'k/x.dump' } as any);
      expect(prisma.pruebaRestauracion.create).toHaveBeenCalled();
      expect(prisma.eventoRespaldo.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tipo: 'prueba_restauracion', actor: 'sistema (CI)' }) }),
      );
    });
  });

  describe('crear', () => {
    it('rechaza si la empresa no existe', async () => {
      prisma.empresa.findUnique.mockResolvedValue(null);
      await expect(service.crear({ empresaId: 'x', alcance: 'base_datos' } as any, 'admin@x')).rejects.toThrow(/empresa/i);
    });

    it('deriva el destino del negocio, nace VALIDANDO/PENDIENTE y registra el evento', async () => {
      prisma.empresa.findUnique.mockResolvedValue({ id: 'e1', nombre: 'Cliente A' });
      prisma.respaldoNegocio.create.mockImplementation(({ data }: any) => ({
        ...data, id: 'b1', createdAt: new Date(), empresa: { nombre: 'Cliente A', codigo: 'cli-a' },
      }));
      const r = await service.crear({ empresaId: 'e1', alcance: 'base_datos_archivos' } as any, 'admin@x');
      const data = prisma.respaldoNegocio.create.mock.calls[0][0].data;
      expect(data.estado).toBe('VALIDANDO');
      expect(data.integridad).toBe('PENDIENTE');
      expect(data.destinoNombre).toContain('Cliente A');
      expect(data.creadoPor).toBe('admin@x');
      expect(data.eventos.create.tipo).toBe('respaldo_creado');
      expect(r.alcanceLabel).toBe('Base de datos y archivos');
    });
  });

  describe('verificarIntegridad', () => {
    it('un respaldo VALIDANDO verificado OK pasa a COMPLETADO', async () => {
      prisma.respaldoNegocio.findUnique.mockResolvedValue({ id: 'b1', estado: 'VALIDANDO', empresaId: 'e1' });
      prisma.respaldoNegocio.update.mockImplementation(({ data }: any) => ({
        id: 'b1', estado: data.estado, integridad: data.integridad, empresa: {}, createdAt: new Date(),
        alcance: 'base_datos', retencionDias: 90, cifrado: true,
      }));
      await service.verificarIntegridad('b1', { resultado: 'VERIFICADO' } as any, 'admin@x');
      const data = prisma.respaldoNegocio.update.mock.calls[0][0].data;
      expect(data.integridad).toBe('VERIFICADO');
      expect(data.estado).toBe('COMPLETADO');
    });

    it('CON_OBSERVACIONES no cambia el estado del respaldo', async () => {
      prisma.respaldoNegocio.findUnique.mockResolvedValue({ id: 'b1', estado: 'VALIDANDO', empresaId: 'e1' });
      prisma.respaldoNegocio.update.mockImplementation(({ data }: any) => ({
        id: 'b1', estado: data.estado, integridad: data.integridad, empresa: {}, createdAt: new Date(),
        alcance: 'base_datos', retencionDias: 90, cifrado: true,
      }));
      await service.verificarIntegridad('b1', { resultado: 'CON_OBSERVACIONES' } as any, 'admin@x');
      expect(prisma.respaldoNegocio.update.mock.calls[0][0].data.estado).toBe('VALIDANDO');
    });
  });

  describe('solicitarRestauracion', () => {
    it('rechaza si el respaldo no está COMPLETADO', async () => {
      prisma.respaldoNegocio.findUnique.mockResolvedValue({ id: 'b1', estado: 'VALIDANDO', empresaId: 'e1' });
      await expect(service.solicitarRestauracion('b1', { motivo: 'x' } as any, 'admin@x')).rejects.toThrow(/COMPLETADO/);
    });

    it('crea la solicitud PENDIENTE_APROBACION desde un respaldo COMPLETADO', async () => {
      prisma.respaldoNegocio.findUnique.mockResolvedValue({ id: 'b1', estado: 'COMPLETADO', empresaId: 'e1' });
      prisma.solicitudRestauracion.create.mockImplementation(({ data }: any) => ({
        ...data, id: 's1', createdAt: new Date(), estado: 'PENDIENTE_APROBACION',
        empresa: { nombre: 'A' }, respaldo: { alcance: 'base_datos', tamanoBytes: null, createdAt: new Date() },
      }));
      const s = await service.solicitarRestauracion('b1', { motivo: 'corrupción de datos' } as any, 'admin@x');
      expect(prisma.solicitudRestauracion.create.mock.calls[0][0].data.solicitadoPor).toBe('admin@x');
      expect(s.estado).toBe('PENDIENTE_APROBACION');
    });
  });

  describe('flujo de aprobación / ejecución', () => {
    const mockUpdate = () => prisma.solicitudRestauracion.update.mockImplementation(({ data }: any) => ({
      id: 's1', respaldoId: 'b1', empresaId: 'e1', motivo: 'm', solicitadoPor: 'admin@x',
      estado: data.estado, aprobacionContacto: data.aprobacionContacto ?? null, aprobacionEvidencia: data.aprobacionEvidencia ?? null,
      aprobadoEn: data.aprobadoEn ?? null, ejecutadoEn: data.ejecutadoEn ?? null, rechazoMotivo: data.rechazoMotivo ?? null,
      createdAt: new Date(), empresa: { nombre: 'A' }, respaldo: { alcance: 'base_datos', tamanoBytes: null, createdAt: new Date() },
    }));

    it('registrarAprobacion exige estado PENDIENTE_APROBACION', async () => {
      prisma.solicitudRestauracion.findUnique.mockResolvedValue({ id: 's1', estado: 'APROBADA', respaldoId: 'b1', empresaId: 'e1' });
      await expect(service.registrarAprobacion('s1', { contacto: 'c', evidencia: 'TICKET-1' } as any, 'admin@x')).rejects.toThrow(/PENDIENTE_APROBACION/);
    });

    it('registrarAprobacion guarda contacto + evidencia y pasa a APROBADA', async () => {
      prisma.solicitudRestauracion.findUnique.mockResolvedValue({ id: 's1', estado: 'PENDIENTE_APROBACION', respaldoId: 'b1', empresaId: 'e1' });
      mockUpdate();
      const s = await service.registrarAprobacion('s1', { contacto: 'Juan (cliente)', evidencia: 'CORREO-2026-09-10' } as any, 'admin@x');
      const data = prisma.solicitudRestauracion.update.mock.calls[0][0].data;
      expect(data.estado).toBe('APROBADA');
      expect(data.aprobacionEvidencia).toBe('CORREO-2026-09-10');
      expect(s.estado).toBe('APROBADA');
    });

    it('ejecutarRestauracion exige estado APROBADA', async () => {
      prisma.solicitudRestauracion.findUnique.mockResolvedValue({ id: 's1', estado: 'PENDIENTE_APROBACION', respaldoId: 'b1', empresaId: 'e1' });
      await expect(service.ejecutarRestauracion('s1', {} as any, 'admin@x')).rejects.toThrow(/APROBADA/);
    });

    it('ejecutarRestauracion sobre una APROBADA la deja RESTAURADA con ejecutadoEn', async () => {
      prisma.solicitudRestauracion.findUnique.mockResolvedValue({ id: 's1', estado: 'APROBADA', respaldoId: 'b1', empresaId: 'e1' });
      mockUpdate();
      await service.ejecutarRestauracion('s1', {} as any, 'admin@x');
      const data = prisma.solicitudRestauracion.update.mock.calls[0][0].data;
      expect(data.estado).toBe('RESTAURADA');
      expect(data.ejecutadoEn).toBeInstanceOf(Date);
    });
  });

  describe('resumen', () => {
    it('cuenta completados / verificados y evalúa cifrado global', async () => {
      // count() se llama 4 veces sobre respaldoNegocio con `where` distinto:
      // total(3) · COMPLETADO(2) · VERIFICADO(1) · cifrado:false(1)
      prisma.respaldoNegocio.count.mockImplementation((arg?: any) => {
        const w = arg?.where;
        if (!w) return Promise.resolve(3);
        if (w.estado === 'COMPLETADO') return Promise.resolve(2);
        if (w.integridad === 'VERIFICADO') return Promise.resolve(1);
        if (w.cifrado === false) return Promise.resolve(1);
        return Promise.resolve(0);
      });
      prisma.solicitudRestauracion.count.mockResolvedValue(2);

      const r = await service.resumen();
      expect(r.completados).toBe(2);
      expect(r.verificados).toBe(1);
      expect(r.restauracionesPendientes).toBe(2);
      expect(r.cifradoActivo).toBe(false); // total>0 pero hay 1 sin cifrar
    });
  });
});
