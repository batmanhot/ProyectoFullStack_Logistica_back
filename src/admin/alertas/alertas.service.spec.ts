import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertasService } from './alertas.service';

describe('AlertasService.vencimientosProximos', () => {
  let prismaMock: any;
  let service: AlertasService;

  beforeEach(() => {
    prismaMock = {
      reglaAlertaVencimiento: { findMany: vi.fn() },
      empresa: { findMany: vi.fn() },
    };
    service = new AlertasService(prismaMock);
  });

  it('devuelve vacío si no hay reglas activas', async () => {
    prismaMock.reglaAlertaVencimiento.findMany.mockResolvedValue([]);
    const resultado = await service.vencimientosProximos();
    expect(resultado).toEqual([]);
    expect(prismaMock.empresa.findMany).not.toHaveBeenCalled();
  });

  it('incluye una empresa cuyo vencimiento cae dentro del umbral de la regla', async () => {
    prismaMock.reglaAlertaVencimiento.findMany.mockResolvedValue([
      { id: 'r1', diasAntes: 30, asunto: 'Tu plan vence pronto', canales: ['email'] },
    ]);
    const en15Dias = new Date(Date.now() + 15 * 86400000);
    prismaMock.empresa.findMany.mockResolvedValue([
      { id: 'e1', nombre: 'Cliente A', codigo: 'cliente-a', fechaVencimiento: en15Dias },
    ]);

    const resultado = await service.vencimientosProximos();

    expect(resultado).toHaveLength(1);
    expect(resultado[0].empresaId).toBe('e1');
    expect(resultado[0].reglaAplicable?.id).toBe('r1');
  });

  it('NO incluye una empresa cuyo vencimiento está fuera del umbral de todas las reglas', async () => {
    prismaMock.reglaAlertaVencimiento.findMany.mockResolvedValue([
      { id: 'r1', diasAntes: 30, asunto: 'Aviso', canales: ['email'] },
    ]);
    const en90Dias = new Date(Date.now() + 90 * 86400000);
    prismaMock.empresa.findMany.mockResolvedValue([
      { id: 'e1', nombre: 'Cliente A', codigo: 'cliente-a', fechaVencimiento: en90Dias },
    ]);

    const resultado = await service.vencimientosProximos();
    expect(resultado).toHaveLength(0);
  });

  it('ordena los resultados por días ascendente (los más urgentes primero)', async () => {
    prismaMock.reglaAlertaVencimiento.findMany.mockResolvedValue([
      { id: 'r1', diasAntes: 60, asunto: 'Aviso', canales: ['email'] },
    ]);
    prismaMock.empresa.findMany.mockResolvedValue([
      { id: 'e1', nombre: 'Lejano', codigo: 'lejano', fechaVencimiento: new Date(Date.now() + 50 * 86400000) },
      { id: 'e2', nombre: 'Urgente', codigo: 'urgente', fechaVencimiento: new Date(Date.now() + 5 * 86400000) },
    ]);

    const resultado = await service.vencimientosProximos();
    expect(resultado[0].empresaId).toBe('e2');
    expect(resultado[1].empresaId).toBe('e1');
  });
});
