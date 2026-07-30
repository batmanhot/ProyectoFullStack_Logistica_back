/**
 * Ejecuta prisma/sql/create_app_role.sql — crea o actualiza el rol
 * "stockpro_app" (sin superusuario, sin dueño de tablas) que la app usa
 * en tiempo de ejecución para que Row-Level Security aplique de verdad.
 * Se conecta con DATABASE_URL (el rol "postgres" original) porque crear
 * un rol y otorgar privilegios es DDL/DCL.
 *
 * Uso: STOCKPRO_APP_DB_PASSWORD=<contraseña> npx ts-node prisma/create-app-role.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const password = process.env.STOCKPRO_APP_DB_PASSWORD;
  if (!password) {
    throw new Error('Define STOCKPRO_APP_DB_PASSWORD antes de correr este script.');
  }

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'stockpro_app') THEN
        CREATE ROLE stockpro_app WITH LOGIN PASSWORD '${password}';
      ELSE
        ALTER ROLE stockpro_app WITH LOGIN PASSWORD '${password}';
      END IF;
    END
    $$;
  `);
  console.log('  ✓ Rol stockpro_app creado/actualizado');

  const sqlPath = path.join(__dirname, 'sql', 'create_app_role.sql');
  const sql = fs
    .readFileSync(sqlPath, 'utf-8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(stmt);
  }
  console.log('  ✓ Privilegios GRANT/ALTER DEFAULT PRIVILEGES aplicados');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
