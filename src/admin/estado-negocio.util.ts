// Umbrales del ciclo de vida de un Negocio/Empresa (Fase 0 — gobierno del
// SuperAdmin, 2026-09-04). Compartido entre NegociosService (estado que ve
// el PlatformAdmin en el panel) y AuthService (gate real de acceso al
// login) para que sean SIEMPRE el mismo cálculo — antes divergían: el cron
// solo corregía el campo `estado` para planes trial, así que un negocio con
// plan pago vencido podía figurar "Activo" en el panel mientras sus
// usuarios ya estaban bloqueados en el login.
export const DIAS_ANTES_POR_VENCER = 30;
export const DIAS_GRACIA = 5;

// Estados que el PlatformAdmin fija a mano — nunca se sobrescriben por el
// cálculo en vivo ni por el cron de vencimiento.
const ESTADOS_MANUALES = ['suspendido', 'cancelado', 'archivado'];

/**
 * Estado EFECTIVO de una empresa — el que se muestra en el panel de
 * SuperAdmin. Nunca se persiste (salvo la transición final a 'vencido' que
 * sí asienta el cron, ver NegociosService.actualizarEstadosVencimiento) —
 * se recalcula en cada lectura a partir de fechaVencimiento, así que nunca
 * queda desactualizado.
 */
export function calcularEstadoEfectivo(empresa: { estado: string; fechaVencimiento: Date | null }): string {
  if (ESTADOS_MANUALES.includes(empresa.estado)) return empresa.estado;
  if (!empresa.fechaVencimiento) return empresa.estado;

  const dias = Math.ceil((empresa.fechaVencimiento.getTime() - Date.now()) / 86_400_000);
  if (dias > DIAS_ANTES_POR_VENCER) return empresa.estado;
  if (dias >= 0) return 'por_vencer';
  if (dias >= -DIAS_GRACIA) return 'gracia';
  return 'vencido';
}

/** true si, agotado el período de gracia, la empresa ya no debería poder iniciar sesión. */
export function fechaVencimientoSuperoGracia(fechaVencimiento: Date): boolean {
  const limite = new Date(fechaVencimiento.getTime() + DIAS_GRACIA * 86_400_000);
  return limite.getTime() < Date.now();
}
