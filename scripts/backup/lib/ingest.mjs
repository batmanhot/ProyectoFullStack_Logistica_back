// Cliente del canal de ingesta del panel SuperAdmin.
// El panel refleja lo que reportamos por acá — la app nunca ejecuta el dump.
const BASE = (process.env.BACKUP_API_URL || 'http://localhost:3000/api').replace(/\/$/, '');
const TOKEN = process.env.BACKUP_INGEST_TOKEN;

async function call(method, path, body) {
  if (!TOKEN) {
    if (method === 'GET') throw new Error('BACKUP_INGEST_TOKEN es obligatorio para leer del panel.');
    console.warn(`  ! BACKUP_INGEST_TOKEN no seteado — no se registra "${path}" en el panel.`);
    return null;
  }
  const res = await fetch(`${BASE}/admin/backups/ingest/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Backup-Token': TOKEN },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`ingest ${method} ${path} → HTTP ${res.status}: ${JSON.stringify(json.error ?? json)}`);
  }
  return json.data ?? json;
}
const post = (path, body) => call('POST', path, body);

/** Registra un respaldo terminado. `empresaId` ausente ⇒ plataforma completa. */
export const registrarRespaldo = (payload) => post('respaldo', payload);

/** Registra el resultado del test de restauración (job de CI). */
export const registrarTestRestore = (payload) => post('test-restore', payload);

/** Lee una SolicitudRestauracion (para el script de restore). */
export const leerSolicitud = (id) => call('GET', `solicitud/${id}`);

/** Cierra el ciclo de una restauración ejecutada por el script. */
export const registrarResultadoRestauracion = (payload) => post('restauracion-resultado', payload);
