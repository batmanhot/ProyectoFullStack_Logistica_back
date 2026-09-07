// ═══════════════════════════════════════════════════════════════════
// Backfill puntual (2026-09-04): completa costoUnitario en los Movimiento
// SALIDA de Pedidos Internos que se entregaron ANTES del fix que hace que
// entregar() tome Producto.precioCompra automáticamente. Sin este backfill,
// esos movimientos históricos quedan valorizando S/0.00 para siempre en el
// reporte "Consumo por Proyecto" — el fix del service solo aplica hacia
// adelante.
//
// Uso: npx ts-node scripts/backfill-costo-pedidos-internos.ts
//
// Se conecta con DATABASE_URL (rol dueño, bypassa RLS) — igual que
// prisma/seed.ts — porque es un script de mantenimiento puntual, no
// tráfico de la app en runtime (que sí debe pasar por RLS vía
// APP_DATABASE_URL, ver PrismaService).
// ═══════════════════════════════════════════════════════════════════
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const movimientos = await prisma.movimiento.findMany({
    where: { tipo: 'SALIDA', pedidoInternoId: { not: null }, costoUnitario: null },
    select: {
      id: true,
      cantidad: true,
      producto: { select: { id: true, sku: true, nombre: true, precioCompra: true } },
      pedidoInterno: { select: { numero: true } },
    },
  });

  if (movimientos.length === 0) {
    console.log('Nada que corregir — no hay Movimiento SALIDA de Pedidos Internos con costoUnitario null.');
    return;
  }

  console.log(`Encontrados ${movimientos.length} movimiento(s) sin costoUnitario:\n`);

  let corregidos = 0;
  let sinPrecioCompra = 0;

  for (const m of movimientos) {
    const pedidoNum = m.pedidoInterno?.numero ?? '(sin pedido)';
    if (m.producto.precioCompra == null) {
      console.log(`  SKIP  ${pedidoNum} · ${m.producto.sku} — ${m.producto.nombre}: el producto no tiene precioCompra cargado`);
      sinPrecioCompra++;
      continue;
    }
    await prisma.movimiento.update({
      where: { id: m.id },
      data: { costoUnitario: m.producto.precioCompra },
    });
    const valor = Number(m.cantidad) * Number(m.producto.precioCompra);
    console.log(`  OK    ${pedidoNum} · ${m.producto.sku} — ${m.producto.nombre}: costoUnitario = ${m.producto.precioCompra} (valor línea: ${valor.toFixed(2)})`);
    corregidos++;
  }

  console.log(`\nListo: ${corregidos} corregido(s), ${sinPrecioCompra} sin precioCompra (quedan en S/0.00 — cargar el costo del producto y volver a correr este script).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
