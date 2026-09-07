"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
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
//# sourceMappingURL=backfill-costo-pedidos-internos.js.map