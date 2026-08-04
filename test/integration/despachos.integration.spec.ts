import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DespachosService } from '../../src/despachos/despachos.service';
import { MovimientosService } from '../../src/movimientos/movimientos.service';
import { PickingService } from '../../src/picking/picking.service';
import { dbOwner, nuevoPrismaService, crearFixtureEmpresa, limpiarFixtureEmpresa } from './setup';

describe('DespachosService (integración, Postgres real)', () => {
  let prisma: ReturnType<typeof nuevoPrismaService>;
  let service: DespachosService;
  let picking: PickingService;
  let fx: Awaited<ReturnType<typeof crearFixtureEmpresa>>;

  /** Confirma el picking del 100% de las líneas — requisito de marcarListo() desde el módulo de Picking. */
  async function completarPicking(despachoId: string) {
    const lista = await picking.findByDespacho(fx.empresaId, despachoId);
    for (const linea of lista!.lineas) {
      await picking.confirmarLinea(fx.empresaId, despachoId, linea.id, { cantidad: Number(linea.cantidadRequerida) });
    }
  }

  beforeAll(async () => {
    prisma = nuevoPrismaService();
    await prisma.$connect();
    picking = new PickingService(prisma);
    service = new DespachosService(prisma, new MovimientosService(prisma), picking);
    fx = await crearFixtureEmpresa('desp');
  });

  afterAll(async () => {
    await limpiarFixtureEmpresa(fx.empresaId);
    await prisma.$disconnect();
    await dbOwner.$disconnect();
  });

  async function leerInventario() {
    return dbOwner.inventario.findFirstOrThrow({ where: { productoId: fx.productoId, almacenId: fx.almacenId } });
  }

  it('create() reserva stock (cantidadReservada sube, cantidad real no se toca)', async () => {
    const despacho = await service.create(fx.empresaId, {
      clienteId: fx.clienteId,
      almacenId: fx.almacenId,
      items: [{ productoId: fx.productoId, cantidad: 10, precioVenta: 100 }],
    } as any);

    expect(despacho.estado).toBe('PEDIDO');
    const inv = await leerInventario();
    expect(Number(inv.cantidad)).toBe(100);
    expect(Number(inv.cantidadReservada)).toBe(10);

    // cancelar() debe liberar la reserva sin tocar la cantidad real
    await service.cancelar(fx.empresaId, despacho.id);
    const invTrasCancelar = await leerInventario();
    expect(Number(invTrasCancelar.cantidad)).toBe(100);
    expect(Number(invTrasCancelar.cantidadReservada)).toBe(0);
  });

  it('el ciclo completo hasta despachar() descuenta la cantidad real y genera un Movimiento SALIDA', async () => {
    const despacho = await service.create(fx.empresaId, {
      clienteId: fx.clienteId,
      almacenId: fx.almacenId,
      items: [{ productoId: fx.productoId, cantidad: 5, precioVenta: 100 }],
    } as any);

    await service.aprobar(fx.empresaId, despacho.id);
    await service.iniciarPicking(fx.empresaId, despacho.id);
    await completarPicking(despacho.id);
    await service.marcarListo(fx.empresaId, despacho.id);
    const despachado = await service.despachar(fx.empresaId, despacho.id, {} as any);

    expect(despachado.estado).toBe('DESPACHADO');
    const inv = await leerInventario();
    // 100 inicial - 10 reservados/cancelados en el test anterior (ya liberados) - 5 despachados reales
    expect(Number(inv.cantidad)).toBe(95);
    expect(Number(inv.cantidadReservada)).toBe(0);

    const movimiento = await dbOwner.movimiento.findFirst({
      where: { productoId: fx.productoId, tipo: 'SALIDA', documento: despacho.numero },
    });
    expect(movimiento).not.toBeNull();
    expect(Number(movimiento!.cantidad)).toBe(5);
  });

  it('marcarListo() rechaza mientras la ListaPicking generada al iniciar picking no esté completa', async () => {
    const despacho = await service.create(fx.empresaId, {
      clienteId: fx.clienteId,
      almacenId: fx.almacenId,
      items: [{ productoId: fx.productoId, cantidad: 2, precioVenta: 100 }],
    } as any);
    await service.aprobar(fx.empresaId, despacho.id);
    await service.iniciarPicking(fx.empresaId, despacho.id);

    const lista = await picking.findByDespacho(fx.empresaId, despacho.id);
    expect(lista!.lineas).toHaveLength(1);
    expect(lista!.lineas[0].estado).toBe('PENDIENTE');

    await expect(service.marcarListo(fx.empresaId, despacho.id)).rejects.toThrow(/líneas de picking sin completar/);

    await completarPicking(despacho.id);
    const listo = await service.marcarListo(fx.empresaId, despacho.id);
    expect(listo.estado).toBe('LISTO');
  });
});
