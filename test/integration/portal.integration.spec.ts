import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { DespachosService } from '../../src/despachos/despachos.service';
import { MovimientosService } from '../../src/movimientos/movimientos.service';
import { PickingService } from '../../src/picking/picking.service';
import { PortalService } from '../../src/portal/portal.service';
import { dbOwner, nuevoPrismaService, crearFixtureEmpresa, limpiarFixtureEmpresa } from './setup';

describe('PortalService.aprobarYConvertir (integración, Postgres real)', () => {
  let prisma: ReturnType<typeof nuevoPrismaService>;
  let portalService: PortalService;
  let fx: Awaited<ReturnType<typeof crearFixtureEmpresa>>;

  async function crearPedidoPortal() {
    return dbOwner.pedidoPortal.create({
      data: {
        empresaId: fx.empresaId,
        numero: `PPE-${Date.now()}`,
        clienteId: fx.clienteId,
        estado: 'NUEVO',
        subtotal: 100,
        igv: 18,
        total: 118,
        items: { create: [{ productoId: fx.productoId, cantidad: 1, precioUnitario: 100, subtotal: 100 }] },
      },
    });
  }

  beforeAll(async () => {
    prisma = nuevoPrismaService();
    await prisma.$connect();
    const despachosService = new DespachosService(prisma, new MovimientosService(prisma), new PickingService(prisma));
    portalService = new PortalService(prisma, new JwtService(), despachosService);
    fx = await crearFixtureEmpresa('portal');
  });

  afterAll(async () => {
    await limpiarFixtureEmpresa(fx.empresaId);
    await prisma.$disconnect();
    await dbOwner.$disconnect();
  });

  it('crea el Despacho y marca CONVERTIDO en una única transacción atómica', async () => {
    const pedido = await crearPedidoPortal();

    const resultado = await portalService.aprobarYConvertir(fx.empresaId, pedido.id, { almacenId: fx.almacenId } as any);

    expect(resultado.estado).toBe('CONVERTIDO');
    expect(resultado.despachoId).toBeTruthy();

    const despacho = await dbOwner.despacho.findUnique({ where: { id: resultado.despachoId! } });
    expect(despacho).not.toBeNull();
    expect(despacho!.clienteId).toBe(fx.clienteId);
    expect(despacho!.estado).toBe('PEDIDO');

    const inv = await dbOwner.inventario.findFirstOrThrow({ where: { productoId: fx.productoId, almacenId: fx.almacenId } });
    expect(Number(inv.cantidadReservada)).toBe(1); // el despacho creado reservó stock real
  });

  it('rechaza aprobar dos veces el mismo pedido (ya no está en NUEVO)', async () => {
    const pedido = await crearPedidoPortal();
    await portalService.aprobarYConvertir(fx.empresaId, pedido.id, { almacenId: fx.almacenId } as any);

    await expect(
      portalService.aprobarYConvertir(fx.empresaId, pedido.id, { almacenId: fx.almacenId } as any),
    ).rejects.toThrow(/No se puede aprobar/);
  });
});
