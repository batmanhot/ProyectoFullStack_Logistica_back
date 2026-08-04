import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SeveridadIncidencia } from '@prisma/client';
import { IncidenciasService } from '../../incidencias/incidencias.service';

// Claves nunca persistidas en el contexto de una incidencia — evita guardar
// credenciales aunque lleguen en el body de la request que disparó el error.
const CLAVES_SENSIBLES = new Set(['password', 'passwordHash', 'token', 'accessToken', 'refreshToken']);

function sanearBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>).map(([k, v]) =>
      CLAVES_SENSIBLES.has(k) ? [k, '***'] : [k, v],
    ),
  );
}

/**
 * Traduce cualquier excepción (HttpException o no) al mismo shape
 * { data, error } que usa el ResponseEnvelopeInterceptor en el camino feliz
 * (sección 6.1). "data" siempre null en error.
 *
 * Además persiste cada 500 en el Registro de Incidencias (ver
 * incidencias.service.ts) — propuesta aprobada 2026-07-31, al estilo
 * "Registro de eventos de Windows". Best-effort: nunca debe retrasar ni
 * romper la respuesta ya construida al cliente.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  constructor(private readonly incidenciasService: IncidenciasService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

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
      this.registrarIncidenciaAsync(status, err, request);
    }

    response.status(status).send({
      data: null,
      error: {
        statusCode: status,
        message: typeof message === 'string' ? message : (message as any).message ?? message,
      },
    });
  }

  private registrarIncidenciaAsync(status: number, err: Error | undefined, request: FastifyRequest) {
    const user = (request as any).user;
    const empresaId = user?.empresaId;
    // Sin tenant resuelto (login fallido, JWT inválido) no hay dónde archivar
    // la incidencia bajo RLS — se queda solo en el log de consola de arriba.
    if (!empresaId) return;

    const segmentos = request.url.split('?')[0].split('/').filter(Boolean);
    const modulo = segmentos[1] || 'sistema'; // segmentos[0] === 'api' (prefijo global)

    // Heurística de severidad: sin stack (rechazo no-Error) o timeout de BD ⇒
    // CRÍTICO; cualquier otra excepción no controlada ⇒ ALTO. Cualquier
    // excepción de dominio puede afinar esto lanzando con una property
    // `severidad` propia en el futuro si hiciera falta.
    const mensaje = err?.message ?? 'Error desconocido';
    const esCritico = !err || /timeout|connection|ECONNREFUSED|too many clients/i.test(mensaje);
    const severidad = esCritico ? SeveridadIncidencia.CRITICO : SeveridadIncidencia.ALTO;

    this.incidenciasService
      .registrar(empresaId, {
        usuarioId: user?.sub,
        usuarioNombre: user?.email,
        modulo,
        opcion: `${request.method} ${request.url}`,
        codigoError: status,
        mensaje,
        stackTrace: err?.stack,
        severidad,
        contexto: { body: sanearBody(request.body), query: request.query },
      })
      .catch((e) => this.logger.error('No se pudo registrar la incidencia', e?.stack ?? String(e)));
  }
}
