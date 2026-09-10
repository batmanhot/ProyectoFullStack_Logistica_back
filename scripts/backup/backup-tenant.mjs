#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Export lógico de UN tenant. Lee CADA tabla con RLS dentro de
// `SET LOCAL app.current_tenant` → la propia RLS filtra las filas del negocio
// (tablas hijas incluidas). Snapshot consistente: un solo $transaction
// REPEATABLE READ. Serializa a JSON → gzip → (age) → object storage → panel.
//
// Es para PORTABILIDAD / "dame mis datos" / offboarding y como insumo del
// restore per-tenant. El backup de DR es backup-full.mjs.
//
//   node scripts/backup/backup-tenant.mjs --empresa <codigo|id> [--retencion 30]
//   node scripts/backup/backup-tenant.mjs --all
// ─────────────────────────────────────────────────────────────────────────
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pkg from '@prisma/client';
import { rlsTables } from './lib/tenant-tables.mjs';
import { subir } from './lib/artifact.mjs';
import { registrarRespaldo } from './lib/ingest.mjs';

const { PrismaClient } = pkg;
const SAFE_ID = /^[a-z0-9_-]+$/i;
const HERE = dirname(fileURLToPath(import.meta.url));

const has = (n) => process.argv.includes(`--${n}`);
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? (process.argv[i + 1]?.startsWith('--') ? true : process.argv[i + 1]) : d; };
const jsonReplacer = (_k, v) => (typeof v === 'bigint' ? v.toString() : Buffer.isBuffer(v) ? { $b64: v.toString('base64') } : v);

function schemaVersion() {
  const migs = readdirSync(join(HERE, '..', '..', 'prisma', 'migrations')).filter((d) => /^\d{14}_/.test(d)).sort();
  return migs.at(-1) ?? 'desconocida';
}

async function exportarTenant(prisma, empresa, tablas) {
  if (!SAFE_ID.test(empresa.id)) throw new Error(`empresaId inseguro: ${empresa.id}`);
  const tomadoEn = new Date().toISOString();

  const data = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${empresa.id}'`);
      const out = {};
      for (const t of tablas) {
        out[t] = await tx.$queryRawUnsafe(`SELECT * FROM "${t}"`);
      }
      return out;
    },
    { isolationLevel: 'RepeatableRead', timeout: 180_000, maxWait: 15_000 },
  );

  const totalFilas = Object.values(data).reduce((n, rows) => n + rows.length, 0);
  const doc = {
    meta: { empresaId: empresa.id, codigo: empresa.codigo, nombre: empresa.nombre, tomadoEn, schemaVersion: schemaVersion(), tablas: tablas.length, totalFilas },
    data,
  };
  const buffer = Buffer.from(JSON.stringify(doc, jsonReplacer));
  const keyBase = `tenant/${empresa.codigo || empresa.id}/${tomadoEn.slice(0, 10)}_${Date.now()}.json`;

  console.log(`  · ${empresa.codigo}: ${totalFilas} filas en ${tablas.length} tablas`);
  const { storageKey, checksum, tamanoBytes } = await subir(keyBase, buffer);

  await registrarRespaldo({
    empresaId: empresa.id,
    alcance: 'base_datos',
    formato: 'json_tenant',
    storageKey,
    checksum,
    tamanoBytes,
    retencionDias: Number(arg('retencion', 30)),
    tomadoEn,
  });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const tablas = await rlsTables(prisma);
    let empresas;
    if (has('all')) {
      empresas = await prisma.empresa.findMany({
        where: { estado: { notIn: ['archivado', 'cancelado'] } },
        select: { id: true, codigo: true, nombre: true },
      });
    } else {
      const ref = arg('empresa');
      if (!ref) throw new Error('Usá --empresa <codigo|id> o --all');
      const e = await prisma.empresa.findFirst({ where: { OR: [{ id: ref }, { codigo: ref }] }, select: { id: true, codigo: true, nombre: true } });
      if (!e) throw new Error(`No existe el negocio "${ref}"`);
      empresas = [e];
    }

    console.log(`🗄️  Export por tenant — ${empresas.length} negocio(s) · ${tablas.length} tablas RLS · schema ${schemaVersion()}`);
    let ok = 0;
    for (const e of empresas) {
      try {
        await exportarTenant(prisma, e, tablas);
        ok++;
      } catch (err) {
        console.error(`  ✗ ${e.codigo}: ${err.message}`);
        await registrarRespaldo({
          empresaId: e.id, alcance: 'base_datos', formato: 'json_tenant',
          storageKey: `FALLIDO/${e.codigo}/${Date.now()}`, estado: 'FALLIDO', nota: err.message,
        }).catch(() => {});
      }
    }
    console.log(`\n✅ ${ok}/${empresas.length} export(s) completos.`);
    if (ok < empresas.length) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
