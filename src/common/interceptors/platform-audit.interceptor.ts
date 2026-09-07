import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { PlatformAdminPayload } from '../guards/platform-admin.guard';

const CAMPOS_SENSIBLES = ['password', 'adminPassword', 'passwordHash', 'confirmacionNombre'];

/**
 * Auditoría de acciones del PlatformAdmin (2026-09-04) — antes crear/editar/
 * "eliminar" un negocio, o resetear la contraseña del admin de un tenant, no
 * dejaba ningún rastro de quién lo hizo. Se aplica con
 * `@UseInterceptors(PlatformAuditInterceptor)` en cada controller de
 * /admin/* — así agregar cobertura a un endpoint nuevo no requiere tocar
 * el service, solo heredar el interceptor del controller.
 *
 * Solo audita mutaciones (no GET). Best-effort: un fallo al escribir el log
 * nunca debe romper la respuesta ya resuelta al PlatformAdmin.
 */
@Injectable()
export class PlatformAuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    if (request.method === 'GET') return next.handle();

    const admin = request.platformAdmin as PlatformAdminPayload | undefined;
    if (!admin?.sub) return next.handle(); // no debería pasar tras PlatformAdminGuard, pero sin admin no hay a quién auditar

    const recurso = context.getClass().name.replace('Controller', '').toLowerCase();
    const accion = context.getHandler().name;
    const recursoId: string | undefined = request.params?.id;
    const datos = this.sanitizar(request.body);

    return next.handle().pipe(
      tap((resultado: any) => {
        const empresaId =
          (request.body?.empresaId as string | undefined) ??
          (recurso === 'negocios' ? (recursoId ?? resultado?.id) : undefined);

        this.prisma.auditoriaPlataforma
          .create({
            data: {
              adminId: admin.sub,
              adminEmail: admin.email ?? '',
              accion,
              recurso,
              recursoId: recursoId ?? resultado?.id ?? null,
              empresaId: empresaId ?? null,
              detalle: `${accion} sobre ${recurso}${recursoId ? ` (${recursoId})` : ''}`,
              datos: Object.keys(datos).length ? (datos as Prisma.InputJsonObject) : undefined,
            },
          })
          .catch(() => {});
      }),
    );
  }

  private sanitizar(body: unknown): Record<string, unknown> {
    if (!body || typeof body !== 'object') return {};
    const copia: Record<string, unknown> = { ...(body as Record<string, unknown>) };
    for (const campo of CAMPOS_SENSIBLES) delete copia[campo];
    return copia;
  }
}
