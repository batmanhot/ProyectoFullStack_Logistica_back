import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonitorService } from './monitor.service';

function prismaMock() {
  return {
    empresa: { findMany: vi.fn().mockResolvedValue([]) },
    incidenteMonitor: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn() },
    auditoriaPlataforma: { create: vi.fn().mockResolvedValue({}) },
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  } as any;
}

describe('MonitorService', () => {
  let prisma: any;
  let svc: MonitorService;

  beforeEach(() => {
    prisma = prismaMock();
    svc = new MonitorService(prisma);
  });

  function tick(over: Partial<Parameters<MonitorService['registrar']>[0]> = {}) {
    svc.registrar({
      ts: Date.now(), metodo: 'GET', ruta: '/api/despachos', status: 200, ms: 30,
      usuarioId: 'u1', empresaId: 'e1', origen: 'tenant', ...over,
    });
  }

  it('resumen agrega KPIs reales del ring buffer', async () => {
    for (let i = 0; i < 10; i++) tick({ ms: 20 });
    tick({ status: 500, ms: 900 }); // 1 error

    const r = await svc.resumen();
    expect(r.kpis.peticionesPorMin).toBe(11);
    expect(r.kpis.tasaErrorPct).toBeCloseTo(9.09, 1);
    expect(r.kpis.sesionesActivas).toBe(1);
    expect(r.serie).toHaveLength(12);
    expect(r.actividad.length).toBe(11);
  });

  it('clasifica un grupo de API como degradado cuando la tasa de error supera 5%', async () => {
    for (let i = 0; i < 10; i++) tick({ ruta: '/api/portal/pedidos', status: i < 2 ? 500 : 200 });
    const r = await svc.resumen();
    const portal = r.servicios.find(s => s.nombre === 'Portal B2B');
    expect(portal?.estado).toBe('degradado');
  });

  it('la sonda de base de datos es "operativo" cuando SELECT 1 responde rápido', async () => {
    const r = await svc.resumen();
    const bd = r.servicios.find(s => s.nombre === 'Base de datos');
    expect(bd?.estado).toBe('operativo');
    expect(bd?.tipo).toBe('Base de datos');
  });

  it('evaluarIncidentes abre un incidente cuando un servicio queda degradado', async () => {
    for (let i = 0; i < 12; i++) tick({ ruta: '/api/portal/pedidos', status: i < 3 ? 500 : 200 });
    await svc.evaluarIncidentes();
    expect(prisma.incidenteMonitor.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ servicio: 'Portal B2B', severidad: 'degradado' }) }),
    );
    expect(prisma.auditoriaPlataforma.create).toHaveBeenCalled();
  });

  it('evaluarIncidentes resuelve un incidente abierto cuando el servicio vuelve a operativo', async () => {
    for (let i = 0; i < 12; i++) tick({ ruta: '/api/portal/pedidos', status: 200 });
    prisma.incidenteMonitor.findMany.mockResolvedValue([{ id: 'i1', servicio: 'Portal B2B', severidad: 'degradado', resueltoAt: null }]);
    await svc.evaluarIncidentes();
    expect(prisma.incidenteMonitor.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'i1' }, data: expect.objectContaining({ resueltoAt: expect.any(Date) }) }),
    );
  });
});
