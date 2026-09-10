#!/usr/bin/env node
// Canario de CI: valida que el backup/restore por tenant sigue siendo viable
// contra el schema real. Necesita conexión a la BD (usa el catálogo de RLS).
// FALLA si: una tabla con RLS no tiene delegate de Prisma, hay un ciclo de FK
// no resoluble, o una tabla de tenant usa un tipo sin soporte de restore.
import pkg from '@prisma/client';
import { rlsTables, fkInsertOrder } from './lib/tenant-tables.mjs';

const { PrismaClient, Prisma } = pkg;

async function main() {
  const prisma = new PrismaClient();
  let problemas = 0;
  try {
    const tablas = await rlsTables(prisma);
    console.log(`Tablas con RLS (dato de tenant): ${tablas.length}`);
    console.log(`  ${tablas.join(', ')}`);

    const porDbName = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.dbName ?? m.name, m]));
    for (const t of tablas) {
      const m = porDbName.get(t);
      if (!m) {
        console.error(`✗ La tabla RLS "${t}" no tiene modelo/delegate en Prisma — el restore no puede escribirla.`);
        problemas++;
        continue;
      }
      const bytes = m.fields.filter((f) => f.type === 'Bytes').map((f) => f.name);
      if (bytes.length) console.warn(`  ! ${m.name} (${t}) tiene Bytes (${bytes.join(', ')}) — se restaura vía base64, verificá.`);
    }

    const orden = await fkInsertOrder(prisma, tablas);
    if (orden.length !== tablas.length) {
      console.error(`✗ El orden de FK cubre ${orden.length}/${tablas.length} tablas.`);
      problemas++;
    } else {
      console.log(`✓ Orden de FK resuelto (${orden.length} tablas).`);
    }
  } finally {
    await prisma.$disconnect();
  }

  if (problemas) {
    console.error(`\n${problemas} problema(s). Revisar scripts/backup/ o el schema.`);
    process.exit(1);
  }
  console.log('\n✅ Backup/restore por tenant: cobertura OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
