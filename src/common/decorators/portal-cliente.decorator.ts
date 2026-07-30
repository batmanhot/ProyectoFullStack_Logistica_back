import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Extrae el Cliente autenticado en el Portal (payload del JWT de portal). */
export const CurrentPortalCliente = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.portalCliente;
});
