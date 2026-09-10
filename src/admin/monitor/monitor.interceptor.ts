import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { performance } from 'node:perf_hooks';
import { MonitorService, MuestraRequest } from './monitor.service';

// Rutas que NO se registran: el propio panel del monitor (evita medirse a sí
// mismo cada 5s) y el health-check de Render (ruido de infraestructura).
const IGNORAR = [/^\/api\/admin\/monitor(\/|$)/, /^\/api\/health(\/|$)/];

@Injectable()
export class MonitorInterceptor implements NestInterceptor {
  constructor(private readonly monitor: MonitorService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req: any = context.switchToHttp().getRequest();
    const res: any = context.switchToHttp().getResponse();
    const url: string = (req.url || req.originalUrl || '').split('?')[0];
    if (IGNORAR.some((re) => re.test(url))) return next.handle();

    const inicio = performance.now();
    // Patrón de ruta de Fastify (…/:id), con fallback a la URL sin query.
    const ruta: string = req.routeOptions?.url ?? req.routerPath ?? url;

    const registrar = (status: number) => {
      const usuarioId: string | undefined =
        req.user?.sub ?? req.user?.id ?? req.usuario?.id ?? req.platformAdmin?.sub;
      const empresaId: string | undefined =
        req.user?.empresaId ?? req.usuario?.empresaId ?? req.empresaId ?? req.tenantId;

      let origen: MuestraRequest['origen'] = 'tenant';
      if (url.startsWith('/api/admin')) origen = 'admin';
      else if (url.startsWith('/api/portal')) origen = 'portal';
      else if (url.startsWith('/api/public') || url.startsWith('/api/health') || url.startsWith('/api/empresas')) origen = 'publico';

      try {
        this.monitor.registrar({
          ts: Date.now(),
          metodo: req.method,
          ruta,
          status,
          ms: performance.now() - inicio,
          usuarioId,
          empresaId,
          origen,
        });
      } catch {
        /* la telemetría nunca debe tumbar una request */
      }
    };

    return next.handle().pipe(
      tap(() => registrar(res.statusCode ?? 200)),
      catchError((err) => {
        registrar(Number(err?.status ?? err?.statusCode ?? 500) || 500);
        return throwError(() => err);
      }),
    );
  }
}
