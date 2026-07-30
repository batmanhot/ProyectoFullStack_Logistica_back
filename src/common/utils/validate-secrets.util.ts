/**
 * Hallazgo Crítico #5 (auditoría de seguridad 2026-07-29): el .env llegó a
 * tener los 4 secretos JWT todavía en sus valores de plantilla de
 * .env.example, sin que nada lo detectara en el arranque. Esta validación
 * corre en bootstrap() antes de levantar el servidor — si algún secreto es
 * un placeholder conocido, está vacío, es demasiado corto, o coincide con
 * otro de los cuatro (deben ser servidores/audiencias distintas), el
 * arranque falla con un mensaje explícito en vez de servir tráfico con
 * tokens forjables.
 */

const PLACEHOLDERS = new Set([
  'cambia-este-valor-en-produccion',
  'cambia-este-otro-valor-en-produccion',
  'cambia-este-valor-tambien-distinto-al-de-arriba',
  'cambia-este-valor-tambien-distinto-a-los-dos-de-arriba',
  'elige-un-valor-distinto-al-de-JWT_SECRET',
  'elige-un-valor-distinto-a-los-otros-dos',
]);

const MIN_LENGTH = 20;

const SECRET_VARS = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'ADMIN_JWT_SECRET', 'PORTAL_JWT_SECRET'] as const;

export function validateJwtSecrets(env: NodeJS.ProcessEnv = process.env): void {
  const valores = new Map<string, string>();

  for (const nombre of SECRET_VARS) {
    const valor = env[nombre];
    if (!valor) {
      throw new Error(`${nombre} no está definida. Configúrala en .env antes de arrancar la API.`);
    }
    if (PLACEHOLDERS.has(valor)) {
      throw new Error(
        `${nombre} todavía tiene el valor de plantilla de .env.example. ` +
          'Genera un secreto aleatorio real antes de arrancar (ej. `node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64\'))"`).',
      );
    }
    if (valor.length < MIN_LENGTH) {
      throw new Error(`${nombre} es demasiado corto (mínimo ${MIN_LENGTH} caracteres) para ser un secreto seguro.`);
    }
    valores.set(nombre, valor);
  }

  const vistos = new Map<string, string>();
  for (const [nombre, valor] of valores) {
    const duplicado = vistos.get(valor);
    if (duplicado) {
      throw new Error(`${nombre} no puede tener el mismo valor que ${duplicado} — cada identidad de auth necesita un secreto propio.`);
    }
    vistos.set(valor, nombre);
  }
}
