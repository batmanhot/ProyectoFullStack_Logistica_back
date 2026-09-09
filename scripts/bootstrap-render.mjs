// ─────────────────────────────────────────────────────────────────────
// bootstrap-render.mjs — Rehace la base de Render de punta a punta.
//
// El Postgres free de Render se borra solo cada ~30 días. Cuando eso pasa
// hay que: crear un Postgres nuevo, y volver a correr migraciones + rol de
// app + seed, sin que se crucen las variables (pasó — ver DEPLOY-RENDER §8).
// Este script hace todo eso desde tu PC contra la External URL nueva, y al
// final VERIFICA que quedó bien e imprime el bloque de env vars para Render.
//
// Uso:
//   1) copiá .env.render.example a .env.render y completá los valores estables
//   2) npm run bootstrap:render -- "<EXTERNAL_DATABASE_URL nueva>"
//      (o dejá RENDER_DATABASE_URL en .env.render y corré sin argumento)
// ─────────────────────────────────────────────────────────────────────
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL('..', import.meta.url));

const C = { r: '\x1b[31m', g: '\x1b[32m', y: '\x1b[33m', b: '\x1b[36m', d: '\x1b[2m', x: '\x1b[0m' };
const log = (m) => console.log(m);
const ok = (m) => console.log(`${C.g}  ✓${C.x} ${m}`);
const step = (m) => console.log(`\n${C.b}▸ ${m}${C.x}`);
const die = (m) => { console.error(`\n${C.r}✗ ${m}${C.x}\n`); process.exit(1); };

// ── 1. Config ────────────────────────────────────────────────────────
function parseEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const cfg = parseEnvFile(`${ROOT}/.env.render`);
const argUrl = process.argv[2];
let DATABASE_URL = (argUrl || cfg.RENDER_DATABASE_URL || '').trim();
const APP_PASS = (cfg.STOCKPRO_APP_DB_PASSWORD || '').trim();
const ADMIN_EMAIL = (cfg.PLATFORM_ADMIN_EMAIL || 'admin@stockpro.dev').trim();
const ADMIN_PASS = (cfg.PLATFORM_ADMIN_PASSWORD || '').trim();
const SEED_DEMO_TENANTS = (cfg.SEED_DEMO_TENANTS || 'false').trim();
const ALLOW_DEMO_LOGIN = (cfg.ALLOW_DEMO_LOGIN || 'false').trim();

if (!DATABASE_URL) die('Falta la URL de la base. Pasala como argumento o poné RENDER_DATABASE_URL en .env.render');
if (!/^postgres(ql)?:\/\//.test(DATABASE_URL)) die(`RENDER_DATABASE_URL no parece una URL de Postgres: ${DATABASE_URL}`);
if (!APP_PASS) die('Falta STOCKPRO_APP_DB_PASSWORD en .env.render');
if (!ADMIN_PASS) die('Falta PLATFORM_ADMIN_PASSWORD en .env.render');

// External necesita SSL; lo agregamos si no vino.
if (!/[?&]sslmode=/.test(DATABASE_URL)) DATABASE_URL += (DATABASE_URL.includes('?') ? '&' : '?') + 'sslmode=require';

const u = new URL(DATABASE_URL);
const dbName = u.pathname.replace(/^\//, '');
const externalHost = u.hostname;               // dpg-xxxx-a.<region>-postgres.render.com
const internalHost = externalHost.split('.')[0]; // dpg-xxxx-a
if (!dbName) die(`La URL no incluye nombre de base: ${DATABASE_URL}`);

const appUrlInternal = `postgresql://stockpro_app:${encodeURIComponent(APP_PASS)}@${internalHost}/${dbName}`;
const appUrlExternal = `postgresql://stockpro_app:${encodeURIComponent(APP_PASS)}@${externalHost}/${dbName}?sslmode=require`;

log(`${C.b}╔══ bootstrap-render ═══════════════════════════════════════╗${C.x}`);
log(`  Base (owner) : ${C.d}${u.username}@${externalHost}/${dbName}${C.x}`);
log(`  Rol app      : stockpro_app`);
log(`  SuperAdmin   : ${ADMIN_EMAIL}`);
log(`  Seed demo    : ${SEED_DEMO_TENANTS}`);
log(`${C.b}╚══════════════════════════════════════════════════════════╝${C.x}`);

const run = (cmd, extraEnv) => {
  log(`${C.d}$ ${cmd}${C.x}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...extraEnv } });
};

// ── 2. Migraciones + rol de app + seed ───────────────────────────────
step('1/4  prisma migrate deploy');
run('npx prisma migrate deploy', { DATABASE_URL });

step('2/4  create-app-role (rol stockpro_app + grants)');
run('npx ts-node prisma/create-app-role.ts', { DATABASE_URL, STOCKPRO_APP_DB_PASSWORD: APP_PASS });

step('3/4  seed (roles base, planes, PlatformAdmin, landing, plataforma-config' + (SEED_DEMO_TENANTS !== 'false' ? ', tenants demo' : '') + ')');
run('npx ts-node prisma/seed.ts', {
  DATABASE_URL,
  SEED_DEMO_TENANTS,
  PLATFORM_ADMIN_EMAIL: ADMIN_EMAIL,
  PLATFORM_ADMIN_PASSWORD: ADMIN_PASS,
});

// ── 3. Verificación real ─────────────────────────────────────────────
step('4/4  verificación');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
let fallos = 0;
const check = async (label, fn) => {
  try {
    const detail = await fn();
    ok(`${label}${detail ? ` ${C.d}(${detail})${C.x}` : ''}`);
  } catch (e) {
    fallos++;
    console.log(`${C.r}  ✗${C.x} ${label} — ${e.message}`);
  }
};

try {
  await check('columnas nuevas en empresas', async () => {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns WHERE table_name='empresas' AND column_name IN ('alertaVencimiento','formulaValorizacion','modoDesarrollo')`,
    );
    const cols = rows.map((r) => r.column_name);
    if (!cols.includes('alertaVencimiento')) throw new Error('falta empresas.alertaVencimiento');
    if (!cols.includes('formulaValorizacion')) throw new Error('falta empresas.formulaValorizacion');
    if (cols.includes('modoDesarrollo')) throw new Error('empresas.modoDesarrollo debería estar eliminada');
    return 'alertaVencimiento + formulaValorizacion, sin modoDesarrollo';
  });

  await check('tabla plataforma_config', async () => {
    const [row] = await prisma.$queryRawUnsafe(`SELECT (to_regclass('public.plataforma_config'))::text AS t`);
    if (!row.t) throw new Error('no existe');
    return 'existe';
  });

  await check('migraciones sin pendientes ni falladas', async () => {
    const [row] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL`,
    );
    if (row.n > 0) throw new Error(`${row.n} migración(es) en estado inconsistente en _prisma_migrations`);
    return 'todas aplicadas';
  });

  await check('PlatformAdmin con contraseña correcta', async () => {
    const admin = await prisma.platformAdmin.findUnique({ where: { email: ADMIN_EMAIL } });
    if (!admin) throw new Error(`no existe la fila para ${ADMIN_EMAIL}`);
    if (!admin.activo) throw new Error('la fila está inactiva (activo=false)');
    if (!bcrypt.compareSync(ADMIN_PASS, admin.passwordHash)) throw new Error('el hash NO hace match con PLATFORM_ADMIN_PASSWORD');
    return `${ADMIN_EMAIL} ok`;
  });

  await check('rol stockpro_app puede conectar (RLS activo)', async () => {
    const appPrisma = new PrismaClient({ datasources: { db: { url: appUrlExternal } } });
    try {
      await appPrisma.$queryRawUnsafe('SELECT 1');
      return 'conecta';
    } finally {
      await appPrisma.$disconnect();
    }
  });
} finally {
  await prisma.$disconnect();
}

if (fallos > 0) die(`${fallos} verificación(es) fallaron — revisá arriba antes de tocar Render.`);
ok('todo verificado');

// ── 4. Bloque para Render ────────────────────────────────────────────
log(`\n${C.g}════════ PEGAR EN RENDER → stockpro-api → Environment ════════${C.x}`);
log(`${C.d}(DATABASE_URL la inyecta el blueprint desde el Postgres — no la toques)${C.x}\n`);
const envs = [
  ['APP_DATABASE_URL', appUrlInternal],
  ['PLATFORM_ADMIN_EMAIL', ADMIN_EMAIL],
  ['PLATFORM_ADMIN_PASSWORD', ADMIN_PASS],
  ['SEED_DEMO_TENANTS', SEED_DEMO_TENANTS],
  ['ALLOW_DEMO_LOGIN', ALLOW_DEMO_LOGIN],
];
for (const [k, v] of envs) log(`  ${k}=${v}`);
log(`\n${C.y}Después:${C.x} Save → el servicio redeploya. Verificá el log: sin P1000 ni "column ... does not exist", estado Live.`);
log(`${C.d}El acceso rápido del Login se activa aparte en SuperAdmin → Ajustes.${C.x}\n`);
