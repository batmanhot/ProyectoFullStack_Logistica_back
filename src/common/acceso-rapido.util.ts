/**
 * Acceso rápido = tarjetas de login sin contraseña (un usuario por rol) que se
 * muestran en el Login para TODOS los negocios. Se controla con un solo switch
 * a nivel plataforma (SuperAdmin → Ajustes, PlataformaConfig.accesoRapidoTarjetas).
 *
 * Candado de entorno: en producción ese switch solo surte efecto si el
 * despliegue lo habilita explícitamente con ALLOW_DEMO_LOGIN=true. Así el
 * SuperAdmin de la instalación de producción real no puede abrir el login sin
 * contraseña con un clic. Fuera de producción (dev local) nunca hay candado.
 */
export function entornoBloqueaAccesoRapido(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_LOGIN !== 'true';
}
