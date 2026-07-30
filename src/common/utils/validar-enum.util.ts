import { BadRequestException } from '@nestjs/common';

/**
 * Valida un filtro de query string contra los valores reales de un enum de
 * Prisma antes de pasarlo a un `where` — evita que un valor inválido llegue
 * crudo a Prisma (que lanza un PrismaClientValidationError sin traducir,
 * respondido hoy como 500 genérico por el filtro global).
 */
export function validarEnum<T extends string>(
  valor: string | undefined,
  valores: readonly T[],
  campo = 'estado',
): T | undefined {
  if (valor === undefined) return undefined;
  if (!valores.includes(valor as T)) {
    throw new BadRequestException(`${campo} inválido: "${valor}"`);
  }
  return valor as T;
}
