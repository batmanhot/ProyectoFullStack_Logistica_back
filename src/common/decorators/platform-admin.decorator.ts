import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Extrae el PlatformAdmin autenticado (payload del JWT de admin). */
export const CurrentPlatformAdmin = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.platformAdmin;
});
