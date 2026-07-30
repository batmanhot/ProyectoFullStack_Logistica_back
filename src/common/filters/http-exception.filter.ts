import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

/**
 * Traduce cualquier excepción (HttpException o no) al mismo shape
 * { data, error } que usa el ResponseEnvelopeInterceptor en el camino feliz
 * (sección 6.1). "data" siempre null en error.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Error interno del servidor';

    // Errores no controlados (500) no dejaban ningún rastro server-side antes
    // de este filtro — los 4xx controlados son ruido esperado, no se loguean.
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      const err = exception instanceof Error ? exception : undefined;
      this.logger.error(err?.message ?? String(exception), err?.stack);
    }

    response.status(status).send({
      data: null,
      error: {
        statusCode: status,
        message: typeof message === 'string' ? message : (message as any).message ?? message,
      },
    });
  }
}
