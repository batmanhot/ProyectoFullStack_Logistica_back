// Empaquetado del artefacto de backup: gzip → (age) → checksum → storage.
// Cero dependencias nuevas obligatorias:
//   - gzip / sha256: módulos nativos de Node.
//   - cifrado: binario `age` en el PATH + BACKUP_AGE_RECIPIENT (si falta, avisa
//     y deja el .gz sin cifrar — solo aceptable en dev local).
//   - storage: filesystem local siempre; R2/S3 si BACKUP_STORAGE_BUCKET está,
//     vía import dinámico de @aws-sdk/client-s3 (no es dep del proyecto: se
//     instala en el runner de CI).
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const AGE_RECIPIENT = process.env.BACKUP_AGE_RECIPIENT;
const BUCKET = process.env.BACKUP_STORAGE_BUCKET;
const LOCAL_DIR = process.env.BACKUP_LOCAL_DIR || './backups';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** gzip + (age si hay recipient). Devuelve { buffer, ext, cifrado }. */
export function empaquetar(buffer) {
  const gz = gzipSync(buffer, { level: 9 });
  if (!AGE_RECIPIENT) {
    console.warn('  ! BACKUP_AGE_RECIPIENT no seteado — el artefacto va SIN cifrar (ok solo en dev).');
    return { buffer: gz, ext: '.gz', cifrado: false };
  }
  const r = spawnSync('age', ['-r', AGE_RECIPIENT, '-o', '-'], { input: gz, maxBuffer: 1024 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error(`age falló (status ${r.status}): ${r.stderr?.toString() || 'binario age no encontrado en el PATH'}`);
  }
  return { buffer: r.stdout, ext: '.gz.age', cifrado: true };
}

/**
 * Sube el artefacto. `key` sin extensión (se le agrega la de empaquetar()).
 * @returns { storageKey, checksum, tamanoBytes, cifrado }
 */
export async function subir(keyBase, plainBuffer) {
  const { buffer, ext, cifrado } = empaquetar(plainBuffer);
  const key = keyBase + ext;
  const checksum = sha256(buffer);

  if (BUCKET) {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3').catch(() => {
      throw new Error('Falta @aws-sdk/client-s3 para subir a R2/S3 (npm i -D @aws-sdk/client-s3 en el runner).');
    });
    const s3 = new S3Client({
      region: 'auto',
      endpoint: process.env.BACKUP_STORAGE_ENDPOINT, // R2: https://<acct>.r2.cloudflarestorage.com
      credentials: {
        accessKeyId: process.env.BACKUP_STORAGE_KEY_ID,
        secretAccessKey: process.env.BACKUP_STORAGE_SECRET,
      },
    });
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: 'application/octet-stream' }));
    console.log(`  ✓ subido a ${BUCKET}/${key} (${buffer.length} bytes, ${cifrado ? 'cifrado' : 'sin cifrar'})`);
  } else {
    const path = join(LOCAL_DIR, key);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, buffer);
    console.log(`  ✓ escrito en ${path} (${buffer.length} bytes, ${cifrado ? 'cifrado' : 'sin cifrar'})`);
  }
  return { storageKey: key, checksum, tamanoBytes: buffer.length, cifrado };
}

/** Descarga un artefacto por su storageKey. Devuelve el buffer cifrado tal cual. */
export async function descargar(storageKey) {
  if (BUCKET) {
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region: 'auto',
      endpoint: process.env.BACKUP_STORAGE_ENDPOINT,
      credentials: { accessKeyId: process.env.BACKUP_STORAGE_KEY_ID, secretAccessKey: process.env.BACKUP_STORAGE_SECRET },
    });
    const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: storageKey }));
    const chunks = [];
    for await (const c of out.Body) chunks.push(c);
    return Buffer.concat(chunks);
  }
  const { readFileSync } = await import('node:fs');
  return readFileSync(join(LOCAL_DIR, storageKey));
}

/** age -d + gunzip. Inverso de empaquetar(). */
export function desempaquetar(buffer, storageKey) {
  let gz = buffer;
  if (storageKey.endsWith('.age')) {
    const key = process.env.BACKUP_AGE_IDENTITY_FILE;
    if (!key) throw new Error('Artefacto cifrado: seteá BACKUP_AGE_IDENTITY_FILE con el archivo de clave privada age.');
    const r = spawnSync('age', ['-d', '-i', key, '-o', '-'], { input: buffer, maxBuffer: 1024 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`age -d falló: ${r.stderr?.toString()}`);
    gz = r.stdout;
  }
  return gunzipSync(gz);
}
