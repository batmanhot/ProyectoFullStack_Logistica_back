// Fuente de verdad de "qué es dato de tenant": las tablas con Row-Level
// Security activo en Postgres. Se consulta el catálogo (`pg_class.relrowsecurity`)
// en runtime — no se puede derivar del DMMF de Prisma y una lista a mano se
// desincroniza. Al leerlas con `SET LOCAL app.current_tenant`, la propia RLS
// filtra las filas del negocio (incluye tablas hijas: *_items, líneas, etc.,
// sin tener que saber por qué columna cuelgan).
import { spawnSync } from 'node:child_process';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<string[]>} nombres de tabla con RLS, en un orden estable.
 */
export async function rlsTables(prisma) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT c.relname AS t
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relrowsecurity = true AND c.relkind = 'r' AND n.nspname = 'public'
      ORDER BY c.relname`,
  );
  return rows.map((r) => r.t);
}

/**
 * Orden de INSERCIÓN respetando FK: se resuelve topológicamente desde
 * `information_schema` (qué tabla referencia a cuál). El borrado va en el orden
 * inverso. Si hay un ciclo, se devuelve el mejor esfuerzo y el restore igual
 * funciona porque corre con las FK diferidas / RLS.
 */
export async function fkInsertOrder(prisma, tables) {
  const set = new Set(tables);
  const fks = await prisma.$queryRawUnsafe(
    `SELECT tc.table_name AS child, ccu.table_name AS parent
       FROM information_schema.table_constraints tc
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`,
  );
  const deps = new Map(tables.map((t) => [t, new Set()]));
  for (const { child, parent } of fks) {
    if (set.has(child) && set.has(parent) && child !== parent) deps.get(child).add(parent);
  }
  const order = [];
  const done = new Set();
  const stack = new Set();
  const visit = (t) => {
    if (done.has(t)) return;
    if (stack.has(t)) return; // ciclo — se ignora, lo cubre FK diferida
    stack.add(t);
    for (const p of deps.get(t) ?? []) visit(p);
    stack.delete(t);
    done.add(t);
    order.push(t);
  };
  for (const t of tables) visit(t);
  return order;
}

/** ¿está `age` disponible? (para avisar temprano). */
export function tieneAge() {
  return spawnSync('age', ['--version']).status === 0;
}
