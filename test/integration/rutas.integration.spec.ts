import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DespachosService } from '../../src/despachos/despachos.service';
import { MovimientosService } from '../../src/movimientos/movimientos.service';
import { PickingService } from '../../src/picking/picking.service';
import { RutasService } from '../../src/rutas/rutas.service';
import { dbOwner, nuevoPrismaService, crearFixtureEmpresa, crearTransportista, limpiarFixtureEmpresa } from './setup';

describe('RutasService (integración, Postgres real)', () => {
  let prisma: ReturnType<typeof nuevoPrismaService>;
  let despachosService: DespachosService;
  let picking: PickingService;
  let rutasService: RutasService;
  let fx: Awaited<ReturnType<typeof crearFixtureEmpresa>>;
  let transportistaId: string;

  async function crearDespachoListo(cantidad: number) {
    const d = await despachosService.create(fx.empresaId, {
      clienteId: fx.clienteId,
      almacenId: fx.almacenId,
      items: [{ productoId: fx.productoId, cantidad, precioVenta: 100 }],
    } as any);
    await despachosService.aprobar(fx.empresaId, d.id);
    await despachosService.iniciarPicking(fx.empresaId, d.id);

    // Confirma el picking del 100% de las líneas — requisito de marcarListo().
    const lista = await picking.findByDespacho(fx.empresaId, d.id);
    for (const linea of lista!.lineas) {
      await picking.confirmarLinea(fx.empresaId, d.id, linea.id, { cantidad: Number(linea.cantidadRequerida) });
    }

    await despachosService.marcarListo(fx.empresaId, d.id);
    return d;
  }

  beforeAll(async () => {
    prisma = nuevoPrismaService();
    await prisma.$connect();
    picking = new PickingService(prisma);
    despachosService = new DespachosService(prisma, new MovimientosService(prisma), picking);
    rutasService = new RutasService(prisma, despachosService);
    fx = await crearFixtureEmpresa('ruta');
    transportistaId = (await crearTransportista(fx.empresaId)).id;
  });

  afterAll(async () => {
    await limpiarFixtureEmpresa(fx.empresaId);
    await prisma.$disconnect();
    await dbOwner.$disconnect();
  });

  it('rechaza asignar un despacho que ya está en otra ruta activa', async () => {
    const despacho = await crearDespachoListo(1);
    await rutasService.create(fx.empresaId, {
      transportistaId,
      fechaSalida: new Date().toISOString(),
      despachoIds: [despacho.id],
    } as any);

    await expect(
      rutasService.create(fx.empresaId, {
        transportistaId,
        fechaSalida: new Date().toISOString(),
        despachoIds: [despacho.id],
      } as any),
    ).rejects.toThrow(/ya están asignados a otra ruta activa/);
  });

  it('iniciar() despacha TODOS los despachos de la ruta en una sola transacción atómica', async () => {
    const d1 = await crearDespachoListo(2);
    const d2 = await crearDespachoListo(3);

    const ruta = await rutasService.create(fx.empresaId, {
      transportistaId,
      fechaSalida: new Date().toISOString(),
      despachoIds: [d1.id, d2.id],
    } as any);

    const iniciada = await rutasService.iniciar(fx.empresaId, ruta.id);
    expect(iniciada.estado).toBe('EN_RUTA');

    const despacho1 = await dbOwner.despacho.findUniqueOrThrow({ where: { id: d1.id } });
    const despacho2 = await dbOwner.despacho.findUniqueOrThrow({ where: { id: d2.id } });
    expect(despacho1.estado).toBe('DESPACHADO');
    expect(despacho2.estado).toBe('DESPACHADO');

    const movimientos = await dbOwner.movimiento.findMany({
      where: { tipo: 'SALIDA', documento: { in: [despacho1.numero, despacho2.numero] } },
    });
    expect(movimientos).toHaveLength(2);
  });
});
