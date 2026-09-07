import { BadRequestException } from '@nestjs/common';

/**
 * Traduce un error P2002 de Prisma (violación de índice único) al campo
 * concreto que chocó. Deduplica el patrón repetido en ~30 services:
 *
 *   try { ... } catch (e) {
 *     if (e?.code === 'P2002') throw new BadRequestException('Ya existe ...');
 *     throw e;
 *   }
 *
 * `e.meta.target` trae los nombres de campo del modelo (Prisma/Postgres);
 * el match es por substring para tolerar también el nombre crudo del
 * constraint (`empresas_ruc_key`). El caller pasa un mapa
 * campo → mensaje y, opcional, un mensaje por defecto.
 */
export function mensajeP2002(
  e: unknown,
  mapaCampos: Record<string, string>,
  porDefecto = 'Ya existe un registro con un dato único duplicado',
): string {
  const target = (e as { meta?: { target?: unknown } })?.meta?.target;
  const campos = (Array.isArray(target) ? target : [target])
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.toLowerCase());

  for (const [campo, mensaje] of Object.entries(mapaCampos)) {
    if (campos.some((c) => c.includes(campo.toLowerCase()))) return mensaje;
  }
  return porDefecto;
}

/** `true` si el error es un P2002 de Prisma (unicidad). */
export function esErrorUnicidad(e: unknown): boolean {
  return (e as { code?: string })?.code === 'P2002';
}

/**
 * Azúcar para el caso común: si `e` es P2002, relanza como BadRequestException
 * con el mensaje del campo que chocó; si no, relanza el error tal cual.
 * Uso: `catch (e) { relanzarP2002(e, { ruc: 'Ya existe ...', codigo: '...' }); }`
 */
export function relanzarP2002(
  e: unknown,
  mapaCampos: Record<string, string>,
  porDefecto?: string,
): never {
  if (esErrorUnicidad(e)) {
    throw new BadRequestException(mensajeP2002(e, mapaCampos, porDefecto));
  }
  throw e;
}
