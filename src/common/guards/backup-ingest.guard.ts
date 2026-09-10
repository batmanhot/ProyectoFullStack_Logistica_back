import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

/**
 * Guard del canal de INGESTA de backups: el job externo (GitHub Actions / cron /
 * worker) reporta al panel qué respaldos tomó, sin iniciar sesión como
 * SuperAdmin. Autentica con un token de servicio estático en el header
 * `X-Backup-Token` contra `BACKUP_INGEST_TOKEN`.
 *
 * Solo protege `/admin/backups/ingest/*` — nunca las rutas que opera el
 * SuperAdmin (esas siguen con PlatformAdminGuard).
 */
@Injectable()
export class BackupIngestGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers?: Record<string, string | undefined> }>();
    const expected = process.env.BACKUP_INGEST_TOKEN;

    if (!expected || expected.length < 20) {
      throw new UnauthorizedException('La ingesta de backups no está configurada (BACKUP_INGEST_TOKEN ausente o débil).');
    }
    const token = req.headers?.['x-backup-token'];
    if (!token || token !== expected) {
      throw new UnauthorizedException('Token de ingesta de backups inválido.');
    }
    return true;
  }
}
