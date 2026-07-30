import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Cliente "dueño" (DATABASE_URL, rol postgres) — bypasea RLS, se usa solo
 * para preparar/limpiar fixtures, nunca para ejercitar los services bajo
 * prueba (eso siempre pasa por `nuevoPrismaService()` + `withTenant`, igual
 * que en producción).
 */
export const dbOwner = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

/** Instancia real de PrismaService, conectada con APP_DATABASE_URL (rol sin superusuario) — sujeta a RLS de verdad. */
export function nuevoPrismaService() {
  return new PrismaService();
}

let contador = 0;
/** IDs únicos por test que igual respetan SAFE_ID_PATTERN (solo [a-z0-9]) de withTenant(). */
function idUnico(prefijo: string) {
  contador += 1;
  return `${prefijo}${Date.now()}${contador}`.toLowerCase();
}

/**
 * Crea una Empresa con un Almacén, una Categoría, un Cliente y un Producto
 * con stock inicial — el mínimo común que necesitan los flujos de
 * Despachos/Rutas/Portal/CxC. Devuelve los IDs para usar en cada test.
 */
export async function crearFixtureEmpresa(sufijo: string) {
  const empresaId = idUnico(`e2e${sufijo}`);
  await dbOwner.empresa.create({
    data: { id: empresaId, codigo: idUnico('org'), nombre: `Empresa Integración ${sufijo}`, ruc: idUnico('ruc') },
  });

  const almacen = await dbOwner.almacen.create({ data: { empresaId, nombre: 'Almacén Integración' } });
  const categoria = await dbOwner.categoria.create({ data: { empresaId, nombre: 'Categoría Integración' } });
  const cliente = await dbOwner.cliente.create({ data: { empresaId, razonSocial: 'Cliente Integración' } });
  const producto = await dbOwner.producto.create({
    data: {
      empresaId,
      categoriaId: categoria.id,
      sku: idUnico('sku'),
      nombre: 'Producto Integración',
      precioVenta: 100,
      precioCompra: 60,
    },
  });
  await dbOwner.inventario.create({
    data: { productoId: producto.id, almacenId: almacen.id, cantidad: 100, cantidadReservada: 0 },
  });

  return { empresaId, almacenId: almacen.id, clienteId: cliente.id, productoId: producto.id };
}

export async function crearTransportista(empresaId: string) {
  return dbOwner.transportista.create({ data: { empresaId, nombre: 'Transportista Integración', tipo: 'PROPIO' } });
}

/** Borra en cascada todo lo creado bajo una Empresa de prueba. */
export async function limpiarFixtureEmpresa(empresaId: string) {
  await dbOwner.pagoCxC.deleteMany({ where: { cuenta: { empresaId } } });
  await dbOwner.cuentaPorCobrar.deleteMany({ where: { empresaId } });
  await dbOwner.pedidoPortalItem.deleteMany({ where: { pedidoPortal: { empresaId } } });
  await dbOwner.pedidoPortal.deleteMany({ where: { empresaId } });
  await dbOwner.parada.deleteMany({ where: { ruta: { empresaId } } });
  await dbOwner.ruta.deleteMany({ where: { empresaId } });
  await dbOwner.transportista.deleteMany({ where: { empresaId } });
  await dbOwner.despachoItem.deleteMany({ where: { despacho: { empresaId } } });
  await dbOwner.despacho.deleteMany({ where: { empresaId } });
  await dbOwner.movimiento.deleteMany({ where: { empresaId } });
  await dbOwner.inventario.deleteMany({ where: { producto: { empresaId } } });
  await dbOwner.producto.deleteMany({ where: { empresaId } });
  await dbOwner.cliente.deleteMany({ where: { empresaId } });
  await dbOwner.categoria.deleteMany({ where: { empresaId } });
  await dbOwner.almacen.deleteMany({ where: { empresaId } });
  await dbOwner.empresa.delete({ where: { id: empresaId } });
}
