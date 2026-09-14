import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GithubActionsService } from './github-actions.service';

const TOKEN = 'ghp_untokendefinegranodeveraslargo1234567890';
const REPO = 'batmanhot/ProyectoFullStack_Logistica_back';

function mockFetchOnce(status: number, body: unknown = {}) {
  return vi.fn().mockResolvedValue({ status, json: () => Promise.resolve(body) } as Response);
}

describe('GithubActionsService', () => {
  let service: GithubActionsService;
  const originalToken = process.env.GITHUB_ACTIONS_TOKEN;
  const originalRepo = process.env.GITHUB_REPO;
  const originalRef = process.env.GITHUB_ACTIONS_REF;
  const originalFetch = global.fetch;

  beforeEach(() => {
    service = new GithubActionsService();
    process.env.GITHUB_ACTIONS_TOKEN = TOKEN;
    process.env.GITHUB_REPO = REPO;
    delete process.env.GITHUB_ACTIONS_REF;
  });
  afterEach(() => {
    process.env.GITHUB_ACTIONS_TOKEN = originalToken;
    process.env.GITHUB_REPO = originalRepo;
    process.env.GITHUB_ACTIONS_REF = originalRef;
    global.fetch = originalFetch;
  });

  describe('estado', () => {
    it('disponible cuando token y repo están bien configurados', () => {
      expect(service.estado()).toEqual({ disponible: true, motivo: null, repo: REPO });
    });

    it('no disponible sin token', () => {
      delete process.env.GITHUB_ACTIONS_TOKEN;
      const r = service.estado();
      expect(r.disponible).toBe(false);
      expect(r.motivo).toMatch(/GITHUB_ACTIONS_TOKEN/);
    });

    it('no disponible con token débil (muy corto)', () => {
      process.env.GITHUB_ACTIONS_TOKEN = 'corto';
      expect(service.estado().disponible).toBe(false);
    });

    it('no disponible sin GITHUB_REPO', () => {
      delete process.env.GITHUB_REPO;
      const r = service.estado();
      expect(r.disponible).toBe(false);
      expect(r.motivo).toMatch(/GITHUB_REPO/);
    });

    it('no disponible con GITHUB_REPO mal formado (sin owner/repo)', () => {
      process.env.GITHUB_REPO = 'no-tiene-barra';
      expect(service.estado().disponible).toBe(false);
    });
  });

  describe('urlWorkflow', () => {
    it('arma la URL con el repo configurado', () => {
      expect(service.urlWorkflow('backup-nightly.yml')).toBe(
        `https://github.com/${REPO}/actions/workflows/backup-nightly.yml`,
      );
    });

    it('null si no hay repo configurado', () => {
      delete process.env.GITHUB_REPO;
      expect(service.urlWorkflow('backup-nightly.yml')).toBeNull();
    });
  });

  describe('dispatch', () => {
    it('no configurado → ServiceUnavailableException, sin llamar a fetch', async () => {
      delete process.env.GITHUB_ACTIONS_TOKEN;
      const fetchMock = vi.fn();
      global.fetch = fetchMock as unknown as typeof fetch;
      await expect(service.dispatch('backup-nightly.yml')).rejects.toThrow(ServiceUnavailableException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('204 → resuelve sin lanzar, con la URL/headers/body correctos', async () => {
      const fetchMock = mockFetchOnce(204);
      global.fetch = fetchMock as unknown as typeof fetch;
      await expect(service.dispatch('backup-restore-tenant.yml', { solicitud_id: 's1' })).resolves.toBeUndefined();

      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe(`https://api.github.com/repos/${REPO}/actions/workflows/backup-restore-tenant.yml/dispatches`);
      expect(opts.method).toBe('POST');
      expect(opts.headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(JSON.parse(opts.body)).toEqual({ ref: 'main', inputs: { solicitud_id: 's1' } });
    });

    it('sin inputs, no manda la clave "inputs" en el body', async () => {
      const fetchMock = mockFetchOnce(204);
      global.fetch = fetchMock as unknown as typeof fetch;
      await service.dispatch('backup-nightly.yml');
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual({ ref: 'main' });
    });

    it('respeta GITHUB_ACTIONS_REF si está seteado', async () => {
      process.env.GITHUB_ACTIONS_REF = 'staging';
      const fetchMock = mockFetchOnce(204);
      global.fetch = fetchMock as unknown as typeof fetch;
      await service.dispatch('backup-nightly.yml');
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).ref).toBe('staging');
    });

    it.each([
      [401, ServiceUnavailableException],
      [403, ServiceUnavailableException],
      [404, ServiceUnavailableException],
      [422, BadRequestException],
      [500, ServiceUnavailableException],
    ])('mapea HTTP %i al tipo de excepción correcto', async (status, ExceptionType) => {
      global.fetch = mockFetchOnce(status, { message: 'detalle de github' }) as unknown as typeof fetch;
      await expect(service.dispatch('backup-nightly.yml')).rejects.toThrow(ExceptionType);
    });

    it('error de red / timeout → ServiceUnavailableException', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('network fail')) as unknown as typeof fetch;
      await expect(service.dispatch('backup-nightly.yml')).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
