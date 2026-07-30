import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Extrae el Proveedor autenticado en el Portal (payload del JWT de portal). */
export const CurrentPortalProveedor = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.portalProveedor;
});
