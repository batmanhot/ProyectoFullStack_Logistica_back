// Convierte las acciones crudas de la bitácora (nombre del método del controller +
// slug del recurso) en una frase legible para el panel. El texto crudo se
// conserva en `AuditoriaPlataforma.detalle` / `.datos` — esto es solo presentación.

const VERBO: Record<string, string> = {
  create: 'Creó',
  update: 'Actualizó',
  remove: 'Eliminó',
  archivar: 'Archivó',
  anular: 'Anuló',
  reactivar: 'Reactivó',
  resolversalud: 'Resolvió',
  reabrirsalud: 'Reabrió',
  enviarpendientes: 'Disparó el envío de',
  emitir: 'Emitió',
  registrarcobro: 'Registró el cobro de',
  marcarenviada: 'Marcó como enviada',
  login: 'Inició sesión',
};

const RECURSO: Record<string, { obj: string; label: string }> = {
  negocios: { obj: 'un negocio', label: 'Negocios' },
  planes: { obj: 'un plan', label: 'Planes' },
  renovaciones: { obj: 'una renovación', label: 'Renovaciones' },
  facturacion: { obj: 'una factura', label: 'Facturación' },
  landing: { obj: 'la landing page', label: 'Landing' },
  platformadmins: { obj: 'un administrador de plataforma', label: 'Administradores' },
  'platform-admins': { obj: 'un administrador de plataforma', label: 'Administradores' },
  plataformaconfig: { obj: 'la configuración de plataforma', label: 'Configuración' },
  'plataforma-config': { obj: 'la configuración de plataforma', label: 'Configuración' },
  rolesbase: { obj: 'un rol base', label: 'Roles base' },
  'roles-base': { obj: 'un rol base', label: 'Roles base' },
  datos: { obj: 'los datos demo', label: 'Datos' },
};

const CUID = /^c[a-z0-9]{20,}$/i;

function capitalizar(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Acción legible + categoría (para el sub-texto) de una fila de AuditoriaPlataforma. */
export function humanizarPlataforma(r: {
  accion: string;
  recurso: string;
  recursoId: string | null;
  detalle: string;
}): { texto: string; modulo: string } {
  const acc = (r.accion || '').toLowerCase();
  const rec = (r.recurso || '').toLowerCase();

  if (rec === 'monitor' || acc.startsWith('incidente_')) {
    return { texto: r.detalle || 'Cambio de estado de un servicio', modulo: 'Monitor' };
  }
  if (rec === 'seguridad' || acc === 'login' || acc.includes('sesion')) {
    return { texto: 'Inició sesión en el panel de plataforma', modulo: 'Seguridad' };
  }
  if (rec === 'alertas') {
    const verbo = VERBO[acc] ?? capitalizar(acc);
    const obj = acc === 'resolversalud' || acc === 'reabrirsalud' ? 'una alerta de salud' : 'una regla de alerta';
    return { texto: `${verbo} ${obj}`, modulo: 'Alertas' };
  }
  if (rec === 'backups') {
    const BACKUP_ACC: Record<string, string> = {
      crear: 'Registró un respaldo de negocio',
      verificarintegridad: 'Verificó la integridad de un respaldo',
      actualizarestado: 'Cambió el estado de un respaldo',
      solicitarrestauracion: 'Solicitó una restauración',
      registraraprobacion: 'Registró la aprobación del cliente para una restauración',
      ejecutarrestauracion: 'Ejecutó una restauración',
      rechazarrestauracion: 'Rechazó una solicitud de restauración',
    };
    return { texto: BACKUP_ACC[acc] ?? `${capitalizar(acc)} (backups)`, modulo: 'Backups' };
  }

  const meta = RECURSO[rec];
  const verbo = VERBO[acc] ?? capitalizar(acc);
  const obj = meta?.obj ?? `un registro de ${rec || 'la plataforma'}`;
  // Muestra el identificador solo si es legible (slug), nunca un cuid.
  const sufijo = r.recursoId && !CUID.test(r.recursoId) && r.recursoId.length <= 24 ? ` “${r.recursoId}”` : '';
  return { texto: `${verbo} ${obj}${sufijo}`, modulo: meta?.label ?? capitalizar(rec) };
}

const ACC_TENANT: Record<string, string> = {
  CREATE: 'Creó un registro',
  UPDATE: 'Actualizó un registro',
  DELETE: 'Eliminó un registro',
  LOGIN: 'Inició sesión',
  LOGOUT: 'Cerró sesión',
  LOGIN_FAILED: 'Intento de acceso fallido',
};

/** Acción legible de una fila de la auditoría de un tenant (modelo `Auditoria`). */
export function humanizarTenant(r: { accion: string; modulo: string; detalle: string }): string {
  const d = (r.detalle || '').trim();
  // Si el detalle ya es una frase (no el patrón crudo "ACCION en modulo"), úsalo.
  if (d && !/^(CREATE|UPDATE|DELETE|LOGIN|LOGOUT|LOGIN_FAILED)\b/.test(d)) return d;
  return ACC_TENANT[r.accion] ?? capitalizar(r.accion);
}
