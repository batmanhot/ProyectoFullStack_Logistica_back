// ─────────────────────────────────────────────────────────────────────
// render-redeploy.mjs — Re-crea la Postgres de Render y reconecta el
// backend, de punta a punta, con UN comando.
//
// Por qué existe: el Postgres free de Render se borra solo cada ~30 días
// (DEPLOY-RENDER.md §7). Hasta ahora, recrearla exigía: crear la base a
// mano en el dashboard, correr `bootstrap:render`, y copiar/pegar a mano
// el bloque de env vars en Render → Environment. Este script hace las
// tres cosas usando la API de Render, sin dejar de ser "un solo comando".
//
// ⚠️ SEGURIDAD — por qué es dry-run por defecto:
// El único endpoint de Render para actualizar env vars de un servicio
// (PUT /services/:id/env-vars) REEMPLAZA TODAS las variables, no hace
// merge. Este script SIEMPRE lee primero las variables actuales del
// servicio y arma el arreglo completo (existentes + las 6 que cambian),
// pero aun así el primer paso es mostrar el diff y NO tocar nada — hace
// falta pasar --apply explícito para escribir de verdad. Motivo: ya se
// perdió GITHUB_ACTIONS_TOKEN una vez por una sync de blueprint que
// reemplazó env vars sin avisar (ver render.yaml, comentario 2026-09-15).
//
// Uso:
//   1) Copiá .env.render.example a .env.render y completá los valores
//      (incluye ahora RENDER_API_KEY y RENDER_SERVICE_ID — ver ese archivo
//      para dónde sacarlos).
//   2) Vista previa (no toca nada):
//        npm run redeploy:render
//   3) Si el diff se ve bien, aplicar de verdad:
//        npm run redeploy:render -- --apply
// ─────────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const API = 'https://api.render.com/v1';

const C = { r: '\x1b[31m', g: '\x1b[32m', y: '\x1b[33m', b: '\x1b[36m', d: '\x1b[2m', x: '\x1b[0m' };
const log = (m = '') => console.log(m);
const ok = (m) => console.log(`${C.g}  ✓${C.x} ${m}`);
const step = (m) => console.log(`\n${C.b}▸ ${m}${C.x}`);
const warn = (m) => console.log(`${C.y}  !${C.x} ${m}`);
const die = (m) => { console.error(`\n${C.r}✗ ${m}${C.x}\n`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 0. Config ────────────────────────────────────────────────────────
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
const APPLY = process.argv.includes('--apply');

const API_KEY = (cfg.RENDER_API_KEY || '').trim();
const SERVICE_ID = (cfg.RENDER_SERVICE_ID || '').trim();
const OWNER_ID = (cfg.RENDER_OWNER_ID || '').trim(); // opcional — se autodetecta si falta
const REGION = (cfg.RENDER_REGION || 'virginia').trim();
const PG_PLAN = (cfg.RENDER_DB_PLAN || 'free').trim();
const PG_VERSION = (cfg.RENDER_PG_VERSION || '18').trim();
const DB_NAME = (cfg.RENDER_DB_DISPLAY_NAME || 'stockpro-db').trim();
const APP_PASS = (cfg.STOCKPRO_APP_DB_PASSWORD || '').trim();
const ADMIN_EMAIL = (cfg.PLATFORM_ADMIN_EMAIL || 'admin@stockpro.dev').trim();
const ADMIN_PASS = (cfg.PLATFORM_ADMIN_PASSWORD || '').trim();
const SEED_DEMO_TENANTS = (cfg.SEED_DEMO_TENANTS || 'false').trim();
const ALLOW_DEMO_LOGIN = (cfg.ALLOW_DEMO_LOGIN || 'false').trim();

if (!API_KEY) die('Falta RENDER_API_KEY en .env.render (Dashboard de Render → Account Settings → API Keys).');
if (!SERVICE_ID) die('Falta RENDER_SERVICE_ID en .env.render (URL del servicio en Render: dashboard.render.com/web/srv-XXXXXXXX → ese "srv-..." es el id).');
if (!APP_PASS) die('Falta STOCKPRO_APP_DB_PASSWORD en .env.render.');
if (!ADMIN_PASS) die('Falta PLATFORM_ADMIN_PASSWORD en .env.render.');

// ── 1. Cliente HTTP mínimo para la API de Render ─────────────────────
async function renderApi(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) {
    const detail = typeof json === 'object' ? JSON.stringify(json) : json;
    throw new Error(`${method} ${path} → HTTP ${res.status}: ${detail}`);
  }
  return json;
}

function mask(v) {
  if (!v || v.length < 10) return '••••••';
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}

log(`${C.b}╔══ render-redeploy ${APPLY ? '(APLICANDO)' : '(vista previa — sin --apply)'} ═══════╗${C.x}`);

// ── 2. Owner (workspace) ──────────────────────────────────────────────
step('1/7  Resolviendo workspace de Render');
let ownerId = OWNER_ID;
if (!ownerId) {
  const owners = await renderApi('GET', '/owners?limit=20');
  if (!owners?.length) die('La API key no devuelve ningún workspace (owner). Revisá que sea válida.');
  if (owners.length > 1) {
    warn('Hay más de un workspace visible con esta API key — usando el primero. Si no es el correcto, seteá RENDER_OWNER_ID en .env.render.');
  }
  ownerId = owners[0].owner.id;
}
ok(`owner ${ownerId}`);

// ── 3. Crear la Postgres nueva ────────────────────────────────────────
step('2/7  Creando Postgres nueva en Render');
const pg = await renderApi('POST', '/postgres', {
  name: DB_NAME,
  plan: PG_PLAN,
  region: REGION,
  version: PG_VERSION,
  ownerId,
  databaseName: 'stockpro',
  databaseUser: 'stockpro',
});
ok(`creada: ${pg.id} (${pg.databaseName}@${pg.region}) — ${pg.dashboardUrl}`);

// ── 4. Esperar a que esté disponible ──────────────────────────────────
step('3/7  Esperando a que la base quede "available" (puede tardar ~1 min)');
const FAIL_STATUS = new Set(['unavailable', 'recovery_failed']);
let status = pg.status;
const t0 = Date.now();
while (status !== 'available') {
  if (FAIL_STATUS.has(status)) die(`La base quedó en estado "${status}" — revisar ${pg.dashboardUrl}`);
  if (Date.now() - t0 > 5 * 60_000) die(`Timeout esperando la base (seguía en "${status}" tras 5 min) — revisar ${pg.dashboardUrl}`);
  await sleep(5000);
  const cur = await renderApi('GET', `/postgres/${pg.id}`);
  status = cur.status;
  process.stdout.write(`${C.d}  …${status}${C.x}\r`);
}
log('');
ok('available');

// ── 5. Connection info ────────────────────────────────────────────────
step('4/7  Obteniendo cadenas de conexión');
const conn = await renderApi('GET', `/postgres/${pg.id}/connection-info`);
if (!conn.externalConnectionString || !conn.internalConnectionString) {
  die('La API no devolvió connection strings — revisar manualmente en el dashboard.');
}
ok(`external: ${mask(conn.externalConnectionString)}`);
ok(`internal: ${mask(conn.internalConnectionString)}`);

// ── 6. Migrar + rol RLS + seed + verificación (reusa bootstrap:render) ─
step('5/7  Migraciones + rol stockpro_app + seed + verificación (bootstrap-render.mjs)');
try {
  execFileSync('node', [`${ROOT}/scripts/bootstrap-render.mjs`, conn.externalConnectionString], {
    cwd: ROOT,
    stdio: 'inherit',
  });
} catch {
  die('bootstrap-render.mjs falló (ver arriba) — NO se va a tocar el servicio de Render. La base nueva quedó creada pero sin usar; podés reintentar o borrarla a mano.');
}
ok('base nueva lista y verificada');

// ── 7. Armar los nuevos valores y el diff contra el servicio real ─────
step('6/7  Comparando con las env vars actuales del servicio');

function internalUrlWithRole(internalConnectionString, user, password) {
  const u = new URL(internalConnectionString);
  u.username = user;
  u.password = password;
  return u.toString();
}

const newValues = {
  DATABASE_URL: conn.internalConnectionString, // rol dueño 'stockpro' — mismo que ya trae la connection-info
  APP_DATABASE_URL: internalUrlWithRole(conn.internalConnectionString, 'stockpro_app', APP_PASS),
  PLATFORM_ADMIN_EMAIL: ADMIN_EMAIL,
  PLATFORM_ADMIN_PASSWORD: ADMIN_PASS,
  SEED_DEMO_TENANTS,
  ALLOW_DEMO_LOGIN,
};

// GET pagina de a máx. 100 — con margen de sobra sobre las ~25 vars declaradas en render.yaml.
const current = await renderApi('GET', `/services/${SERVICE_ID}/env-vars?limit=100`);
const currentMap = new Map((current || []).map((it) => [it.envVar.key, it.envVar.value]));

log(`\n${C.b}Diff de env vars (${SERVICE_ID}):${C.x}`);
for (const [k, v] of Object.entries(newValues)) {
  const before = currentMap.has(k) ? mask(currentMap.get(k)) : `${C.y}(no existía)${C.x}`;
  const changed = currentMap.get(k) !== v;
  log(`  ${changed ? C.y + '~' : C.d + '='} ${k}${C.x}  ${before}  →  ${mask(v)}`);
}
log(`${C.d}El resto de las variables existentes (${currentMap.size - Object.keys(newValues).filter(k => currentMap.has(k)).length} más) se reenvían tal cual, sin tocarlas.${C.x}`);

const merged = new Map(currentMap);
for (const [k, v] of Object.entries(newValues)) merged.set(k, v);
const putBody = [...merged.entries()].map(([key, value]) => ({ key, value }));

if (!APPLY) {
  log(`\n${C.y}Vista previa nada más — no se tocó Render.${C.x}`);
  log(`Si el diff de arriba se ve bien: ${C.b}npm run redeploy:render -- --apply${C.x}`);
  log(`${C.d}(la base nueva ya quedó creada y migrada — al volver a correr con --apply NO se crea otra vez, se reintenta el resto)${C.x}\n`);
  process.exit(0);
}

// ── 8. Aplicar env vars + deploy ──────────────────────────────────────
step('7/7  Aplicando env vars y redeployando');
await renderApi('PUT', `/services/${SERVICE_ID}/env-vars`, putBody);
ok(`${putBody.length} variables escritas (reemplazo completo, mismo contenido + los 6 cambios)`);

const deploy = await renderApi('POST', `/services/${SERVICE_ID}/deploys`, { deployMode: 'deploy_only' });
ok(`deploy disparado: ${deploy.id}`);

step('Esperando a que el deploy quede "live"');
const DEPLOY_FAIL = new Set(['build_failed', 'update_failed', 'canceled', 'deactivated']);
const t1 = Date.now();
let dStatus = deploy.status;
while (dStatus !== 'live') {
  if (DEPLOY_FAIL.has(dStatus)) die(`El deploy terminó en estado "${dStatus}" — revisar logs en el dashboard de Render.`);
  if (Date.now() - t1 > 10 * 60_000) die(`Timeout esperando el deploy (seguía en "${dStatus}" tras 10 min) — revisar el dashboard.`);
  await sleep(6000);
  const cur = await renderApi('GET', `/services/${SERVICE_ID}/deploys/${deploy.id}`);
  dStatus = cur.status;
  process.stdout.write(`${C.d}  …${dStatus}${C.x}\r`);
}
log('');
ok('deploy live');

step('Verificando /api/health (el free tier puede tardar ~30-50s en despertar)');
let healthy = false;
for (let i = 0; i < 15 && !healthy; i++) {
  try {
    const r = await fetch('https://stockpro-api.onrender.com/api/health');
    if (r.ok) { healthy = true; break; }
  } catch { /* red/arranque — reintentar */ }
  await sleep(5000);
}
if (!healthy) warn('No respondió /api/health todavía — no es necesariamente un error (cold start), probá de nuevo en un minuto.');
else ok('/api/health OK');

log(`\n${C.g}════════ Listo ════════${C.x}`);
log(`Base nueva: ${pg.id} — ${pg.dashboardUrl}`);
log(`${C.y}La base VIEJA no se borró — hacelo a mano en el dashboard una vez que confirmes que todo anda bien.${C.x}\n`);
