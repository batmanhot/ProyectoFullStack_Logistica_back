import { BadRequestException } from '@nestjs/common';

/**
 * Deduplica el patrón "buscar por id+empresaId, si no existe lanzar excepción"
 * repetido en los métodos `validarX` de los services — cada caller sigue armando su propia
 * query (findFirst/findUnique), esto solo centraliza el chequeo + throw.
 *
 * Por defecto lanza BadRequestException (caso típico: validar una entidad referenciada por
 * otra, ej. "el proveedor de esta orden existe"). Pasar `ExceptionClass` para los casos donde
 * la entidad es el recurso principal del endpoint y corresponde 404 (ej. NotFoundException).
 */
export async function assertExists<T>(
  finder: () => Promise<T | null>,
  mensaje: string,
  ExceptionClass: new (mensaje: string) => Error = BadRequestException,
): Promise<T> {
  const entidad = await finder();
  if (!entidad) throw new ExceptionClass(mensaje);
  return entidad;
}
