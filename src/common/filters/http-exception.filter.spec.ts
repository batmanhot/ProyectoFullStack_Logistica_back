import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { SeveridadIncidencia } from '@prisma/client';

function crearHost(request: any) {
  const response = { status: vi.fn().mockReturnThis(), send: vi.fn() };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('HttpExceptionFilter', () => {
  let incidenciasService: any;
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    incidenciasService = { registrar: vi.fn().mockResolvedValue({}) };
    filter = new HttpExceptionFilter(incidenciasService);
  });

  it('un 500 sin sesión resuelta no intenta persistir (no hay tenant bajo RLS)', () => {
    const { host, response } = crearHost({ url: '/api/despachos', method: 'POST', body: {} });
    filter.catch(new Error('boom'), host);

    expect(incidenciasService.registrar).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(500);
  });

  it('un 500 con usuario autenticado se registra como incidencia, con el body saneado', () => {
    const request = {
      url: '/api/despachos/123',
      method: 'PATCH',
      body: { comentario: 'x', password: 'secreto123' },
      query: {},
      user: { empresaId: 'e1', sub: 'u1', email: 'admin@dlnorte.com' },
    };
    const { host } = crearHost(request);

    filter.catch(new Error('Connection timeout to database'), host);

    expect(incidenciasService.registrar).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({
        usuarioId: 'u1',
        modulo: 'despachos',
        opcion: 'PATCH /api/despachos/123',
        codigoError: 500,
        severidad: SeveridadIncidencia.CRITICO, // heurística: mensaje matchea /timeout/
        contexto: expect.objectContaining({ body: { comentario: 'x', password: '***' } }),
      }),
    );
  });

  it('una excepción HTTP controlada (4xx) no se registra como incidencia', () => {
    const request = { url: '/api/productos', method: 'POST', body: {}, query: {}, user: { empresaId: 'e1' } };
    const { host, response } = crearHost(request);

    filter.catch(new BadRequestException('Campo requerido'), host);

    expect(incidenciasService.registrar).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
  });
});
