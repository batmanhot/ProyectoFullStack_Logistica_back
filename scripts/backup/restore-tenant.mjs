#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Restauración de UN tenant desde un export json_tenant. SUPERVISADO.
// Dry-run por defecto — solo muta con --apply.
//
//   Dry-run (diff actual vs backup, sin tocar nada):
//     node scripts/backup/restore-tenant.mjs --solicitud <id>
//   Ejecutar (¡ventana de mantenimiento! probá en staging primero):
//     node scripts/backup/restore-tenant.mjs --solicitud <id> --apply --url <DB_URL>
//
// Cómo funciona --apply:
//   • Verifica que la solicitud esté APROBADA (con evidencia del cliente).
//   • Toma un "snapshot previo" del estado actual y lo sube.
//   • En UNA transacción, con RLS activa (SET LOCAL app.current_tenant):
//       - DELETE de cada tabla de tenant en orden inverso de FK
//       - INSERT de las filas del backup en orden de FK
//     La RLS scopea DELETE e INSERT al negocio; el orden de FK evita violaciones.
//   • Reporta el resultado al panel (cierra la SolicitudRestauracion).
// ─────────────────────────────────────────────────────────────────────────
import { performance } from 'node:perf_hooks';
import pkg from '@prisma/client';
import { rlsTables, fkInsertOrder } from './lib/tenant-tables.mjs';
import { descargar, desempaquetar, subir } from './lib/artifact.mjs';
import { leerSolicitud, registrarResultadoRestauracion } from './lib/ingest.mjs';

const { PrismaClient, Prisma } = pkg;
const SAFE_ID = /^[a-z0-9_-]+$/i;
const CHUNK = 2_000;

const has = (n) => process.argv.includes(`--${n}`);
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };

// tabla (@@map) -> delegate camelCase de Prisma
function tableToDelegate() {
  const map = new Map();
  for (const m of Prisma.dmmf.datamodel.models) {
    map.set(m.dbName ?? m.name, m.name.charAt(0).toLowerCase() + m.name.slice(1));
  }
  return map;
}
// coerción de tipos que no sobreviven a JSON, por modelo
function coercer(modelName) {
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === modelName);
  if (!m) return (r) => r;
  const bi = m.fields.filter((f) => f.type === 'BigInt').map((f) => f.name);
  const by = m.fields.filter((f) => f.type === 'Bytes').map((f) => f.name);
  return (row) => {
    const out = { ...row };
    for (const k of bi) if (out[k] != null) out[k] = BigInt(out[k]);
    for (const k of by) if (out[k]?.$b64 != null) out[k] = Buffer.from(out[k].$b64, 'base64');
    return out;
  };
}

async function main() {
  const solicitudId = arg('solicitud');
  if (!solicitudId) throw new Error('Falta --solicitud <id>');
  const apply = has('apply');
  console.log(`🔁 Restore de tenant · solicitud ${solicitudId} · ${apply ? 'APPLY (destructivo)' : 'DRY-RUN'}`);

  const sol = await leerSolicitud(solicitudId);
  if (sol.estado !== 'APROBADA') throw new Error(`La solicitud está en ${sol.estado}. Solo se restaura una APROBADA.`);
  if (!sol.empresaId || !SAFE_ID.test(sol.empresaId)) throw new Error(`empresaId inválido: ${sol.empresaId}`);
  if (sol.respaldo?.formato !== 'json_tenant' || !sol.respaldo?.storageKey) throw new Error('El respaldo no es un export json_tenant con storageKey.');
  console.log(`  · negocio ${sol.empresaCodigo} (${sol.empresaId}) · aprobación: ${sol.aprobacionEvidencia}`);

  const raw = await descargar(sol.respaldo.storageKey);
  const doc = JSON.parse(desempaquetar(raw, sol.respaldo.storageKey).toString());
  if (doc.meta.empresaId !== sol.empresaId) throw new Error(`El backup es del negocio ${doc.meta.empresaId}, no de ${sol.empresaId}.`);
  console.log(`  · backup ${doc.meta.tomadoEn} · schema ${doc.meta.schemaVersion} · ${doc.meta.totalFilas} filas`);

  const prisma = new PrismaClient({ datasources: { db: { url: arg('url', process.env.DATABASE_URL) } } });
  try {
    const tablas = await rlsTables(prisma);
    const orden = await fkInsertOrder(prisma, tablas);
    const del = tableToDelegate();
    if (doc.meta.schemaVersion !== undefined) {
      const migs = tablas.length; // heurística: si el set de tablas cambió mucho, avisar
      void migs;
    }

    // Diff actual vs backup
    console.log('\n  Tabla                              actual → backup');
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${sol.empresaId}'`);
      for (const t of orden) {
        const [{ n }] = await tx.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}"`);
        const enBackup = (doc.data[t] ?? []).length;
        console.log(`  ${t.padEnd(34)} ${String(n).padStart(6)} → ${String(enBackup).padStart(6)}${n !== enBackup ? '  ⚠' : ''}`);
      }
    });

    if (!apply) {
      console.log('\n  DRY-RUN. Nada se modificó. Corré con --apply --url <DB_URL> en ventana de mantenimiento.');
      return;
    }

    // Snapshot previo
    console.log('\n  Snapshot previo…');
    const snap = {};
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${sol.empresaId}'`);
      for (const t of tablas) snap[t] = await tx.$queryRawUnsafe(`SELECT * FROM "${t}"`);
    }, { isolationLevel: 'RepeatableRead', timeout: 180_000 });
    const snapBuf = Buffer.from(JSON.stringify({ meta: { ...doc.meta, tomadoEn: new Date().toISOString(), tipo: 'snapshot_previo_restore' }, data: snap },
      (_k, v) => (typeof v === 'bigint' ? v.toString() : Buffer.isBuffer(v) ? { $b64: v.toString('base64') } : v)));
    const { storageKey: snapshotStorageKey } = await subir(`snapshot-previo/${sol.empresaCodigo}/${Date.now()}.json`, snapBuf);

    // Reemplazo (RLS activa → DELETE/INSERT scopeados al negocio)
    const t0 = performance.now();
    let borradas = 0;
    let insertadas = 0;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${sol.empresaId}'`);
      for (const t of [...orden].reverse()) {
        const d = del.get(t);
        if (!d || !tx[d]) throw new Error(`Sin delegate Prisma para la tabla "${t}"`);
        const r = await tx[d].deleteMany({});
        borradas += r.count;
      }
      for (const t of orden) {
        const d = del.get(t);
        const model = [...Prisma.dmmf.datamodel.models].find((m) => (m.dbName ?? m.name) === t)?.name;
        const rows = (doc.data[t] ?? []).map(coercer(model));
        for (let i = 0; i < rows.length; i += CHUNK) {
          const r = await tx[d].createMany({ data: rows.slice(i, i + CHUNK) });
          insertadas += r.count;
        }
      }
    }, { timeout: 900_000, maxWait: 30_000 });

    const seg = ((performance.now() - t0) / 1000).toFixed(1);
    const log = `Restaurado ${sol.empresaCodigo} desde ${sol.respaldo.storageKey}: -${borradas} / +${insertadas} filas en ${seg}s.`;
    console.log(`\n✅ ${log}`);
    await registrarResultadoRestauracion({ solicitudId, resultado: 'ok', log, snapshotStorageKey });
  } catch (err) {
    console.error(`\n✗ ${err.message}`);
    await registrarResultadoRestauracion({ solicitudId, resultado: 'fallo', log: err.message }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
