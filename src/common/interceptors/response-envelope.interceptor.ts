import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Fuerza el contrato { data, error } en TODAS las rutas (sección 6.1).
 * Replica exactamente el shape de ok()/err() en storage.js, para que el
 * adapter del frontend sea un cambio mínimo.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => ({ data, error: null })));
  }
}
