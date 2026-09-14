import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BackupsService } from './backups.service';

describe('BackupsService', () => {
  let prisma: any;
  let github: any;
  let service: BackupsService;

  beforeEach(() => {
    prisma = {
      empresa: { findUnique: vi.fn(), findMany: vi.fn() },
      respaldoNegocio: { findUnique: vi.fn(), findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
      solicitudRestauracion: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn().mockResolvedValue(0), create: vi.fn(), update: vi.fn() },
      eventoRespaldo: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn(), create: vi.fn() },
      pruebaRestauracion: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
      $transaction: vi.fn((ops: any[]) => Promise.all(ops)),
    };
    github = { dispatch: vi.fn().mockResolvedValue(undefined), estado: vi.fn(), urlWorkflow: vi.fn() };
    service = new BackupsService(prisma, github);
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
      estado: data.estado, aprobacionContacto: data.aprobacionContacto ?? null, aprobacionEvidencia: data.aprobacionEvidencia ?? 'CORREO-1',
      aprobadoEn: data.aprobadoEn ?? null, despachadoEn: data.despachadoEn ?? null, ejecutadoEn: data.ejecutadoEn ?? null, rechazoMotivo: data.rechazoMotivo ?? null,
      createdAt: new Date(), empresa: { nombre: 'A' }, respaldo: { alcance: 'base_datos', tamanoBytes: null, createdAt: new Date() },
    }));
    // Estado APROBADA "feliz" que usan los tests de ejecutarRestauracion — con evidencia (obligatoria) y respaldo json_tenant.
    const aprobadaBase = { id: 's1', estado: 'APROBADA', respaldoId: 'b1', empresaId: 'e1', aprobacionEvidencia: 'CORREO-1', nota: null };

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
      await expect(service.ejecutarRestauracion('s1', { confirmacionNombre: 'A' } as any, 'admin@x')).rejects.toThrow(/APROBADA/);
      expect(github.dispatch).not.toHaveBeenCalled();
    });

    it('ejecutarRestauracion rechaza si el nombre tipeado no coincide, sin llamar a GitHub', async () => {
      prisma.solicitudRestauracion.findUnique.mockResolvedValue(aprobadaBase);
      prisma.empresa.findUnique.mockResolvedValue({ nombre: 'Distribuidora Lima Norte' });
      prisma.respaldoNegocio.findUnique.mockResolvedValue({ formato: 'json_tenant', storageKey: 'tenant/dlnorte/x.json.gz' });
      await expect(
        service.ejecutarRestauracion('s1', { confirmacionNombre: 'otro nombre' } as any, 'admin@x'),
      ).rejects.toThrow(/nombre exacto/);
      expect(github.dispatch).not.toHaveBeenCalled();
    });

    it('ejecutarRestauracion rechaza un respaldo que no es json_tenant, sin llamar a GitHub', async () => {
      prisma.solicitudRestauracion.findUnique.mockResolvedValue(aprobadaBase);
      prisma.empresa.findUnique.mockResolvedValue({ nombre: 'Distribuidora Lima Norte' });
      prisma.respaldoNegocio.findUnique.mockResolvedValue({ formato: 'pg_dump', storageKey: null });
      await expect(
        service.ejecutarRestauracion('s1', { confirmacionNombre: 'Distribuidora Lima Norte' } as any, 'admin@x'),
      ).rejects.toThrow(/json_tenant/);
      expect(github.dispatch).not.toHaveBeenCalled();
    });

    it('ejecutarRestauracion rechaza si ya hay una EN_EJECUCION para el mismo negocio', async () => {
      prisma.solicitudRestauracion.findUnique.mockResolvedValue(aprobadaBase);
      prisma.empresa.findUnique.mockResolvedValue({ nombre: 'Distribuidora Lima Norte' });
      prisma.respaldoNegocio.findUnique.mockResolvedValue({ formato: 'json_tenant', storageKey: 'tenant/dlnorte/x.json.gz' });
      prisma.solicitudRestauracion.count.mockResolvedValue(1);
      await expect(
        service.ejecutarRestauracion('s1', { confirmacionNombre: 'Distribuidora Lima Norte' } as any, 'admin@x'),
      ).rejects.toThrow(/en ejecución/);
      expect(github.dispatch).not.toHaveBeenCalled();
    });

    it('ejecutarRestauracion sobre una APROBADA válida dispara GitHub y deja EN_EJECUCION con despachadoEn', async () => {
      prisma.solicitudRestauracion.findUnique.mockResolvedValue(aprobadaBase);
      prisma.empresa.findUnique.mockResolvedValue({ nombre: 'Distribuidora Lima Norte' });
      prisma.respaldoNegocio.findUnique.mockResolvedValue({ formato: 'json_tenant', storageKey: 'tenant/dlnorte/x.json.gz' });
      mockUpdate();
      await service.ejecutarRestauracion('s1', { confirmacionNombre: '  distribuidora lima norte  ' } as any, 'admin@x');
      expect(github.dispatch).toHaveBeenCalledWith('backup-restore-tenant.yml', { solicitud_id: 's1', confirmacion: 'RESTAURAR' });
      const data = prisma.solicitudRestauracion.update.mock.calls[0][0].data;
      expect(data.estado).toBe('EN_EJECUCION');
      expect(data.despachadoEn).toBeInstanceOf(Date);
      expect(data.ejecutadoEn).toBeUndefined(); // lo pone registrarResultadoRestauracion, no acá
    });

    it('si GitHub rechaza el dispatch, la solicitud NO cambia de estado', async () => {
      prisma.solicitudRestauracion.findUnique.mockResolvedValue(aprobadaBase);
      prisma.empresa.findUnique.mockResolvedValue({ nombre: 'Distribuidora Lima Norte' });
      prisma.respaldoNegocio.findUnique.mockResolvedValue({ formato: 'json_tenant', storageKey: 'tenant/dlnorte/x.json.gz' });
      github.dispatch.mockRejectedValue(new Error('GitHub rechazó las credenciales'));
      await expect(
        service.ejecutarRestauracion('s1', { confirmacionNombre: 'Distribuidora Lima Norte' } as any, 'admin@x'),
      ).rejects.toThrow(/rechazó/);
      expect(prisma.solicitudRestauracion.update).not.toHaveBeenCalled();
    });

    it('cancelarEjecucion exige estado EN_EJECUCION', async () => {
      prisma.solicitudRestauracion.findUnique.mockResolvedValue({ id: 's1', estado: 'APROBADA', respaldoId: 'b1', empresaId: 'e1' });
      await expect(service.cancelarEjecucion('s1', 'admin@x')).rejects.toThrow(/EN_EJECUCION/);
    });

    it('cancelarEjecucion vuelve a APROBADA y limpia despachadoEn', async () => {
      prisma.solicitudRestauracion.findUnique.mockResolvedValue({ id: 's1', estado: 'EN_EJECUCION', respaldoId: 'b1', empresaId: 'e1' });
      mockUpdate();
      await service.cancelarEjecucion('s1', 'admin@x');
      const data = prisma.solicitudRestauracion.update.mock.calls[0][0].data;
      expect(data.estado).toBe('APROBADA');
      expect(data.despachadoEn).toBeNull();
    });
  });

  describe('dispararBackupAhora', () => {
    it('dispara backup-nightly.yml y registra el evento', async () => {
      const r = await service.dispararBackupAhora('admin@x');
      expect(github.dispatch).toHaveBeenCalledWith('backup-nightly.yml');
      expect(prisma.eventoRespaldo.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tipo: 'backup_dispatch', actor: 'admin@x' }) }),
      );
      expect(r.ok).toBe(true);
    });

    it('rechaza un segundo disparo dentro de la ventana de espera, sin llamar a GitHub', async () => {
      prisma.eventoRespaldo.findFirst.mockResolvedValue({ fecha: new Date() });
      await expect(service.dispararBackupAhora('admin@x')).rejects.toThrow(/Ya se disparó/);
      expect(github.dispatch).not.toHaveBeenCalled();
    });

    it('si GitHub rechaza el dispatch, no se crea el evento', async () => {
      github.dispatch.mockRejectedValue(new Error('sin token'));
      await expect(service.dispararBackupAhora('admin@x')).rejects.toThrow();
      expect(prisma.eventoRespaldo.create).not.toHaveBeenCalled();
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
