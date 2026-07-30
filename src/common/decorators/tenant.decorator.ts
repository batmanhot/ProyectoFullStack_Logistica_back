import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extrae el empresaId embebido en el JWT (sección 6.2 de la especificación).
 * Requiere que JwtAuthGuard ya haya corrido y poblado request.user.
 */
export const TenantId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  return request.user?.empresaId;
});

/** Extrae el usuario autenticado completo (payload del JWT). */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
