"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
(async () => {
    const roles = await prisma.rol.findMany({
        where: { empresaId: null, codigo: { in: ['supervisor', 'almacenero', 'despachador'] } },
        include: { permisos: { select: { modulo: true } } },
    });
    for (const r of roles) {
        console.log(`${r.codigo} (${r.label}): ${r.permisos.map(p => p.modulo).join(', ')}`);
    }
    await prisma.$disconnect();
})();
//# sourceMappingURL=_verificar-roles.js.map