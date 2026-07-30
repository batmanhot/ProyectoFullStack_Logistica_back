import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../../auditoria/auditoria.service';

const ACCION_POR_METODO: Record<string, string> = {
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};

// Módulos que no se auditan como CRUD genérico: 'auth' porque login/logout/refresh
// se auditan aparte (con accion LOGIN/LOGIN_FAILED) y 'auditoria' para no generar
// ruido al limpiar el propio log.
const MODULOS_EXCLUIDOS = new Set(['auth', 'auditoria']);

/**
 * Registra automáticamente en Auditoria toda mutación exitosa (POST/PUT/PATCH/DELETE)
 * hecha por un usuario autenticado de un tenant, sin requerir que cada servicio
 * llame a AuditoriaService.registrar() manualmente (ver auditoria.service.ts).
 * Best-effort: un fallo al auditar nunca debe romper la respuesta al cliente.
 */
@Injectable()
export class AuditoriaInterceptor implements NestInterceptor {
  constructor(
    private readonly auditoriaService: AuditoriaService,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest();
    const accion = ACCION_POR_METODO[req.method];
    if (!accion) return next.handle();

    const empresaId = req.user?.empresaId;
    const usuarioId = req.user?.sub;
    if (!empresaId || !usuarioId) return next.handle();

    const segmentos = String(req.url).split('?')[0].split('/').filter(Boolean);
    const modulo = segmentos[1] || 'sistema'; // segmentos[0] === 'api' (prefijo global)
    if (MODULOS_EXCLUIDOS.has(modulo)) return next.handle();

    const recursoId = req.params?.id;

    return next.handle().pipe(
      tap(() => {
        this.registrarAsync(empresaId, usuarioId, req.user?.email, accion, modulo, recursoId);
      }),
    );
  }

  private async registrarAsync(
    empresaId: string,
    usuarioId: string,
    email: string | undefined,
    accion: string,
    modulo: string,
    recursoId: string | undefined,
  ) {
    try {
      const usuario = await this.prisma.withTenant(empresaId, (tx) =>
        tx.usuario.findFirst({ where: { id: usuarioId, empresaId }, select: { nombre: true } }),
      );
      await this.auditoriaService.registrar(empresaId, {
        usuarioId,
        usuarioNombre: usuario?.nombre || email || 'Usuario',
        accion,
        modulo,
        detalle: `${accion} en ${modulo}${recursoId ? ` — ${recursoId}` : ''}`,
      });
    } catch {
      // La auditoría es best-effort: nunca debe afectar la respuesta ya enviada.
    }
  }
}
