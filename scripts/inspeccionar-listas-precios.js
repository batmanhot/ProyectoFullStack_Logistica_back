"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const empresas = await prisma.empresa.findMany({ select: { id: true, nombre: true } });
    for (const emp of empresas) {
        const listas = await prisma.listaPrecios.findMany({ where: { empresaId: emp.id } });
        if (listas.length === 0)
            continue;
        const productos = await prisma.producto.findMany({
            where: { empresaId: emp.id },
            select: { id: true, sku: true, nombre: true, estado: true, precioCompra: true, precioVenta: true },
        });
        const prodPorId = new Map(productos.map((p) => [p.id, p]));
        console.log(`\n=== ${emp.nombre} (${emp.id}) — ${listas.length} lista(s), ${productos.length} producto(s) ===`);
        for (const l of listas) {
            console.log(`\n-- Lista "${l.nombre}" (${l.tipo}) — descuento=${l.descuento} markup=${l.markup} activa=${l.activa}`);
            if (Number(l.descuento) > 0 && Number(l.markup) > 0) {
                console.log(`  ⚠ INCONSISTENCIA: descuento y markup ambos > 0 (deberían ser mutuamente excluyentes)`);
            }
            const precios = l.precios ?? {};
            const ids = Object.keys(precios);
            if (ids.length > 0)
                console.log(`  ${ids.length} precio(s) especial(es) por producto`);
            for (const pid of ids) {
                const p = prodPorId.get(pid);
                if (!p) {
                    console.log(`  ⚠ precio especial ${precios[pid]} apunta a productoId ${pid} que NO existe en Producto`);
                    continue;
                }
                if (p.estado !== 'Activo') {
                    console.log(`  ⚠ precio especial en producto INACTIVO: ${p.sku} — ${p.nombre} (no se ve en la tabla filtrada por Activo)`);
                }
            }
        }
        const margenNegativo = productos.filter((p) => p.estado === 'Activo' && Number(p.precioCompra || 0) > 0 && Number(p.precioVenta || 0) > 0
            && Number(p.precioCompra) >= Number(p.precioVenta));
        if (margenNegativo.length > 0) {
            console.log(`\n  ⚠ ${margenNegativo.length} producto(s) activo(s) con costo >= precio de venta base:`);
            for (const p of margenNegativo) {
                console.log(`     ${p.sku} — ${p.nombre}: costo ${p.precioCompra}, precioVenta ${p.precioVenta}`);
            }
        }
        const sinDatos = productos.filter((p) => p.estado === 'Activo' && !Number(p.precioCompra || 0) && !Number(p.precioVenta || 0));
        if (sinDatos.length > 0) {
            console.log(`\n  ${sinDatos.length} producto(s) activo(s) sin costo NI precio de venta cargado (columna Costo y P.Base en 0, margen "—")`);
        }
    }
}
main()
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(async () => { await prisma.$disconnect(); });
//# sourceMappingURL=inspeccionar-listas-precios.js.map