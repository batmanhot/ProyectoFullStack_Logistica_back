import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditoriaPlataformaService } from './auditoria-plataforma.service';

describe('AuditoriaPlataformaService', () => {
  let prisma: any;
  let auditoriaTenant: any;
  let svc: AuditoriaPlataformaService;

  const fila = (over: Partial<any> = {}) => ({
    id: 'a1', timestamp: new Date('2026-09-09T00:00:00Z'),
    adminEmail: 'ana@stockpro.dev', accion: 'update', recurso: 'planes', recursoId: 'pro',
    detalle: 'update sobre planes (pro)', admin: { nombre: 'Ana Ramos' }, empresa: null, ...over,
  });

  beforeEach(() => {
    prisma = {
      auditoriaPlataforma: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      plataformaConfig: { findFirst: vi.fn().mockResolvedValue({ retencionAuditoriaDias: 365 }) },
      $transaction: vi.fn((ops: any[]) => Promise.all(ops)),
      empresa: { findUnique: vi.fn().mockResolvedValue({ nombre: 'ACME SAC' }), findMany: vi.fn().mockResolvedValue([]) },
      withTenant: vi.fn((_id: string, fn: any) => fn({ auditoria: { findMany: vi.fn().mockResolvedValue([]) } })),
    };
    auditoriaTenant = {
      findAll: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 25, kpis: { total: 0, hoy: 0, errores: 0, usuarios: 0 } }),
    };
    svc = new AuditoriaPlataformaService(prisma, auditoriaTenant);
  });

  it('deriva tipo y resultado por fila y aplana actor/recurso', async () => {
    prisma.auditoriaPlataforma.findMany.mockResolvedValue([
      fila({ recurso: 'planes', accion: 'update', recursoId: 'pro' }),
      fila({ id: 'a2', recurso: 'monitor', accion: 'incidente_abierto', detalle: 'API X pasó a degradado', admin: null, adminEmail: 'sistema (monitor)' }),
      fila({ id: 'a3', recurso: 'seguridad', accion: 'login', detalle: 'Inició sesión', admin: { nombre: 'Carlos' } }),
      fila({ id: 'a4', recurso: 'negocios', accion: 'update', recursoId: 'clz9k3p1a0000abcd1234wxyz', empresa: { nombre: 'ACME SAC' } }),
    ]);
    prisma.auditoriaPlataforma.count.mockResolvedValue(4);

    const r = await svc.findAll({ page: 1, pageSize: 25 });

    expect(r.total).toBe(4);
    expect(r.items[0]).toMatchObject({ tipo: 'Suscripción', resultado: 'exitoso', accion: 'Actualizó un plan “pro”', modulo: 'Planes' });
    expect(r.items[1]).toMatchObject({ actor: 'Sistema', tipo: 'Alerta', resultado: 'requiere_atencion', accion: 'API X pasó a degradado' });
    expect(r.items[2]).toMatchObject({ tipo: 'Seguridad', accion: 'Inició sesión en el panel de plataforma' });
    expect(r.items[3]).toMatchObject({ tipo: 'Operación', accion: 'Actualizó un negocio', empresaNombre: 'ACME SAC' });
  });

  it('filtra por tipo con un where de Prisma (Alerta → recurso in monitor/alertas)', async () => {
    await svc.findAll({ tipo: 'Alerta' });
    const arg = prisma.auditoriaPlataforma.findMany.mock.calls[0][0];
    expect(JSON.stringify(arg.where)).toContain('monitor');
  });

  it('pagina con skip/take', async () => {
    await svc.findAll({ page: 3, pageSize: 20 });
    const arg = prisma.auditoriaPlataforma.findMany.mock.calls[0][0];
    expect(arg.skip).toBe(40);
    expect(arg.take).toBe(20);
  });

  it('resumen cuenta el total y los incidentes abiertos', async () => {
    prisma.auditoriaPlataforma.count
      .mockResolvedValueOnce(120) // total
      .mockResolvedValueOnce(3); // accion=incidente_abierto
    const r = await svc.resumen();
    expect(r).toEqual({ total: 120, requierenAtencion: 3, retencionDias: 365 });
  });

  it('sistema(empresaId) delega en AuditoriaService y unifica la forma de la fila', async () => {
    auditoriaTenant.findAll.mockResolvedValue({
      data: [{ id: 't1', timestamp: new Date('2026-09-09T01:00:00Z'), usuarioNombre: 'Luis', accion: 'DELETE', modulo: 'productos', detalle: 'Eliminó producto X' }],
      total: 1, page: 1, pageSize: 25, kpis: { total: 1, hoy: 1, errores: 1, usuarios: 1 },
    });

    const r = await svc.sistema({ empresaId: 'e1' });

    expect(auditoriaTenant.findAll).toHaveBeenCalledWith('e1', expect.any(Object), expect.objectContaining({ page: 1 }));
    expect(r.items[0]).toMatchObject({ ambito: 'sistema', empresaNombre: 'ACME SAC', actor: 'Luis', resultado: 'requiere_atencion' });
  });

  it('sistema() sin empresaId mezcla los eventos recientes de todos los negocios', async () => {
    prisma.empresa.findMany.mockResolvedValue([{ id: 'e1', nombre: 'ACME' }, { id: 'e2', nombre: 'Beta' }]);
    prisma.withTenant.mockImplementation((id: string, fn: any) =>
      fn({
        auditoria: {
          findMany: vi.fn().mockResolvedValue([
            { id: `${id}-1`, timestamp: new Date(id === 'e1' ? '2026-09-09T02:00:00Z' : '2026-09-09T03:00:00Z'), usuarioNombre: 'U', accion: 'UPDATE', modulo: 'stock', detalle: 'd' },
          ]),
        },
      }),
    );

    const r = await svc.sistema({});

    expect(r.total).toBe(2);
    expect(r.parcial).toBe(true);
    expect(r.items[0].empresaNombre).toBe('Beta'); // el más reciente primero
    expect((r.kpis as any).negocios).toBe(2);
  });

  it('purgarPorRetencion borra lo anterior a la ventana configurada', async () => {
    prisma.plataformaConfig.findFirst.mockResolvedValue({ retencionAuditoriaDias: 90 });
    prisma.auditoriaPlataforma.deleteMany.mockResolvedValue({ count: 7 });
    const n = await svc.purgarPorRetencion();
    expect(n).toBe(7);
    const arg = prisma.auditoriaPlataforma.deleteMany.mock.calls[0][0];
    expect(arg.where.timestamp.lt).toBeInstanceOf(Date);
  });
});
