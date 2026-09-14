import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

/**
 * Único punto del backend que sale a un tercero: dispara `workflow_dispatch`
 * en GitHub Actions para correr un backup o una restauración reales — el API
 * nunca ejecuta `pg_dump`/`pg_restore` ni tiene el rol dueño de la base o la
 * clave privada de descifrado (ver docs/BACKUP-RESTORE.md). Esos secretos
 * viven solo como GitHub Actions secrets, en los workflows.
 *
 * Mismo patrón que el resto del repo para secretos: `process.env.X` directo
 * en cada llamada (nunca cacheado, así un redeploy con la variable nueva
 * funciona sin tocar código), sin `ConfigService` — no se usa en ningún lado
 * de este proyecto (ver `backup-ingest.guard.ts`, `email.service.ts`).
 */
export const WORKFLOW_BACKUP = 'backup-nightly.yml';
export const WORKFLOW_RESTORE_TENANT = 'backup-restore-tenant.yml';

export interface EstadoAutomatizacionBackups {
  disponible: boolean;
  motivo: string | null;
  repo: string | null;
}

const REPO_VALIDO = /^[\w.-]+\/[\w.-]+$/;

@Injectable()
export class GithubActionsService {
  private readonly logger = new Logger('GithubActionsService');

  /** Nunca lanza — el panel lo usa para deshabilitar botones con un tooltip en vez de fallar al clickear. */
  estado(): EstadoAutomatizacionBackups {
    const token = process.env.GITHUB_ACTIONS_TOKEN;
    if (!token || token.length < 20) {
      return { disponible: false, motivo: 'GITHUB_ACTIONS_TOKEN no está configurado en el servidor.', repo: null };
    }
    const repo = process.env.GITHUB_REPO;
    if (!repo || !REPO_VALIDO.test(repo)) {
      return { disponible: false, motivo: 'GITHUB_REPO no está configurado (formato esperado: owner/repo).', repo: null };
    }
    return { disponible: true, motivo: null, repo };
  }

  /** Link "Ver ejecución" para el panel — no expone el token. */
  urlWorkflow(workflowFile: string): string | null {
    const { repo } = this.estado();
    return repo ? `https://github.com/${repo}/actions/workflows/${workflowFile}` : null;
  }

  /** Dispara `workflow_dispatch`. Éxito = 204 de GitHub, sin id de run (ver nota en BackupsService). */
  async dispatch(workflowFile: string, inputs?: Record<string, string>): Promise<void> {
    const { disponible, motivo, repo } = this.estado();
    if (!disponible || !repo) {
      throw new ServiceUnavailableException(`La ejecución automática no está configurada en el servidor (${motivo}).`);
    }
    const ref = process.env.GITHUB_ACTIONS_REF || 'main';

    let res: Response;
    try {
      res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflowFile}/dispatches`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_ACTIONS_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'stockpro-api',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(inputs && Object.keys(inputs).length > 0 ? { ref, inputs } : { ref }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      this.logger.error(`No se pudo contactar a GitHub para disparar "${workflowFile}": ${(err as Error).message}`);
      throw new ServiceUnavailableException('No se pudo contactar a GitHub (timeout o error de red).');
    }

    if (res.status === 204) return;

    const body: { message?: string } = await res.json().catch(() => ({}));
    this.logger.error(`GitHub respondió ${res.status} al disparar "${workflowFile}": ${body.message ?? '(sin mensaje)'}`);

    if (res.status === 401) {
      throw new ServiceUnavailableException(
        'GitHub rechazó las credenciales del servidor (token inválido o expirado). Regenerá GITHUB_ACTIONS_TOKEN.',
      );
    }
    if (res.status === 403) {
      throw new ServiceUnavailableException(
        'El token no tiene permiso "actions: write" sobre el repositorio, o se agotó el límite de peticiones de GitHub.',
      );
    }
    if (res.status === 404) {
      throw new ServiceUnavailableException(
        `No se encontró el workflow "${workflowFile}" ni la rama "${ref}" en ${repo}. ¿Está mergeado a main?`,
      );
    }
    if (res.status === 422) {
      throw new BadRequestException(`GitHub rechazó los parámetros del disparo: ${body.message ?? 'ver logs del servidor'}`);
    }
    throw new ServiceUnavailableException(`GitHub respondió HTTP ${res.status} al intentar disparar la ejecución.`);
  }
}
