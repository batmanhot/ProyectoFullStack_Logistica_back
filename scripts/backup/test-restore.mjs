#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Test de restauración: baja el último pg_dump completo, lo restaura en un
// Postgres EFÍMERO y valida. Reporta el resultado al panel (aparece como
// "Prueba de restore" y, si falla, dispara una alerta en el Centro de Alertas).
// Pensado para correr en CI mensual con un service container de Postgres.
//
//   node scripts/backup/test-restore.mjs --dump <storageKey> --target <SCRATCH_DB_URL>
// ─────────────────────────────────────────────────────────────────────────
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { descargar, desempaquetar } from './lib/artifact.mjs';
import { registrarTestRestore } from './lib/ingest.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };

async function main() {
  const dumpKey = arg('dump');
  const target = arg('target', process.env.TEST_RESTORE_DB_URL);
  if (!dumpKey || !target) throw new Error('Faltan --dump <storageKey> y --target <SCRATCH_DB_URL>');

  const t0 = performance.now();
  let resultado = 'fallo';
  let detalle = '';

  try {
    console.log(`🧪 Test de restore · dump ${dumpKey}`);
    const raw = await descargar(dumpKey);
    const dump = desempaquetar(raw, dumpKey); // buffer del .dump (formato custom de pg_dump)
    const tmp = join(tmpdir(), `test-restore-${Date.now()}.dump`);
    writeFileSync(tmp, dump);

    const r = spawnSync('pg_restore', ['--no-owner', '--no-privileges', '--clean', '--if-exists', '-d', target, tmp], { encoding: 'utf8' });
    unlinkSync(tmp);
    if (r.status !== 0) throw new Error(`pg_restore status ${r.status}: ${(r.stderr || '').slice(0, 800)}`);

    // Smoke: la base restaurada tiene datos coherentes.
    const check = spawnSync('psql', [target, '-tAc', 'SELECT count(*) FROM empresas'], { encoding: 'utf8' });
    const empresas = parseInt((check.stdout || '0').trim(), 10);
    if (!Number.isInteger(empresas) || empresas < 1) throw new Error(`smoke check falló: empresas=${check.stdout?.trim()}`);

    resultado = 'ok';
    detalle = `pg_restore OK · ${empresas} empresas · ${((performance.now() - t0) / 1000).toFixed(1)}s`;
    console.log(`✅ ${detalle}`);
  } catch (e) {
    detalle = e.message;
    console.error(`✗ ${detalle}`);
    process.exitCode = 1;
  }

  await registrarTestRestore({
    resultado,
    detalle,
    dumpProbado: dumpKey,
    duracionMs: Math.round(performance.now() - t0),
  }).catch((e) => console.error('no se pudo reportar el resultado:', e.message));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
