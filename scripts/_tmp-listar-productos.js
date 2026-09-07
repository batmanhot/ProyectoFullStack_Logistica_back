"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
(async () => {
    const productos = await prisma.producto.findMany({
        where: { empresaId: 'cmtb9z4c0003jxtscijtrf0wt', estado: 'Activo' },
        select: { sku: true, nombre: true, precioCompra: true, precioVenta: true },
        orderBy: { sku: 'asc' },
    });
    for (const p of productos) {
        console.log(`${p.sku}\t${(p.nombre || '').slice(0, 30)}\tcosto=${p.precioCompra}\tprecioVenta=${p.precioVenta}`);
    }
    await prisma.$disconnect();
})();
//# sourceMappingURL=_tmp-listar-productos.js.map