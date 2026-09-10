#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Backup de DR: pg_dump -Fc de TODA la base → gzip → (age) → object storage
// → registrado en el panel como "Plataforma completa".
// Este es EL backup para recuperación ante desastre. Restore = pg_restore.
//
//   node scripts/backup/backup-full.mjs
//
// Requiere `pg_dump` en el PATH y DATABASE_URL (o --url).
// ─────────────────────────────────────────────────────────────────────────
import { spawnSync } from 'node:child_process';
import { subir } from './lib/artifact.mjs';
import { registrarRespaldo } from './lib/ingest.mjs';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
}

/** Quita query params de Prisma que libpq/pg_dump no entienden (schema, pgbouncer, …). */
function libpqUrl(raw) {
  try {
    const u = new URL(raw);
    for (const p of ['schema', 'pgbouncer', 'connection_limit', 'pool_timeout', 'socket_timeout']) {
      u.searchParams.delete(p);
    }
    return u.toString();
  } catch {
    return raw;
  }
}

async function main() {
  const url = libpqUrl(arg('url', process.env.DATABASE_URL));
  if (!url) throw new Error('Falta DATABASE_URL (o --url).');

  const tomadoEn = new Date().toISOString();
  console.log(`🗄️  pg_dump -Fc de toda la base · ${tomadoEn}`);

  const dump = spawnSync('pg_dump', ['-Fc', '--no-owner', '--no-privileges', url], {
    maxBuffer: 4 * 1024 * 1024 * 1024,
  });
  if (dump.status !== 0) {
    const msg = dump.stderr?.toString() || 'pg_dump no encontrado en el PATH';
    await registrarRespaldo({
      alcance: 'plataforma_completa', formato: 'pg_dump',
      storageKey: `FALLIDO/full/${Date.now()}`, estado: 'FALLIDO', nota: msg.slice(0, 500),
    }).catch(() => {});
    throw new Error(`pg_dump falló: ${msg}`);
  }
  console.log(`  · dump crudo: ${(dump.stdout.length / 1e6).toFixed(1)} MB`);

  const keyBase = `full/${tomadoEn.slice(0, 10)}_${Date.now()}.dump`;
  const { storageKey, checksum, tamanoBytes } = await subir(keyBase, dump.stdout);

  await registrarRespaldo({
    alcance: 'plataforma_completa',
    formato: 'pg_dump',
    storageKey,
    checksum,
    tamanoBytes,
    retencionDias: Number(arg('retencion', 365)),
    tomadoEn,
  });
  console.log('\n✅ Backup completo registrado.');
  // Línea parseable para CI (test de restore).
  console.log(`STORAGE_KEY=${storageKey}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
