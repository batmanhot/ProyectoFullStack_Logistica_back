import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertasService } from './alertas.service';

describe('AlertasService.vencimientosProximos', () => {
  let prismaMock: any;
  let emailMock: any;
  let service: AlertasService;

  beforeEach(() => {
    prismaMock = {
      reglaAlertaVencimiento: { findMany: vi.fn() },
      empresa: { findMany: vi.fn() },
      alertaEnvio: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    };
    emailMock = { enviarCorreoSimple: vi.fn().mockResolvedValue(undefined) };
    service = new AlertasService(prismaMock, emailMock);
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

describe('AlertasService.enviarAlertasPendientes — envío real (2026-09-04)', () => {
  let prismaMock: any;
  let emailMock: any;
  let service: AlertasService;
  const regla = { id: 'r1', diasAntes: 30, asunto: 'Tu plan {plan} vence', mensaje: 'Hola {empresa}, faltan {dias} días', canales: ['email'] };
  const fechaVencimiento = new Date(Date.now() + 15 * 86400000);
  const empresa = { id: 'e1', nombre: 'Cliente A', codigo: 'cliente-a', email: 'cliente@a.com', plan: 'pro', fechaVencimiento };

  beforeEach(() => {
    prismaMock = {
      reglaAlertaVencimiento: { findMany: vi.fn().mockResolvedValue([regla]) },
      empresa: { findMany: vi.fn().mockResolvedValue([empresa]) },
      alertaEnvio: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), findMany: vi.fn() },
    };
    emailMock = { enviarCorreoSimple: vi.fn().mockResolvedValue(undefined) };
    service = new AlertasService(prismaMock, emailMock);
  });

  it('envía el correo con las variables reemplazadas y registra el envío', async () => {
    const r = await service.enviarAlertasPendientes();

    expect(emailMock.enviarCorreoSimple).toHaveBeenCalledWith({
      destinatarioEmail: 'cliente@a.com',
      asunto: regla.asunto,
      mensaje: 'Hola Cliente A, faltan 15 días',
    });
    expect(prismaMock.alertaEnvio.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ empresaId: 'e1', reglaId: 'r1', canal: 'email', estado: 'enviado' }) }),
    );
    expect(r).toEqual({ enviados: 1, fallidos: 0, omitidos: 0 });
  });

  it('no reenvía si ya existe un AlertaEnvio para (empresa, regla, fechaVencimiento vigente)', async () => {
    prismaMock.alertaEnvio.findUnique.mockResolvedValue({ id: 'ya-existe' });

    const r = await service.enviarAlertasPendientes();

    expect(emailMock.enviarCorreoSimple).not.toHaveBeenCalled();
    expect(r.omitidos).toBe(1);
  });

  it('omite (sin intentar) una regla sin canal "email" — whatsapp/sms no tienen envío real', async () => {
    prismaMock.reglaAlertaVencimiento.findMany.mockResolvedValue([{ ...regla, canales: ['whatsapp'] }]);

    const r = await service.enviarAlertasPendientes();

    expect(emailMock.enviarCorreoSimple).not.toHaveBeenCalled();
    expect(r.omitidos).toBe(1);
  });

  it('omite una empresa sin email de contacto', async () => {
    prismaMock.empresa.findMany.mockResolvedValue([{ ...empresa, email: null }]);

    const r = await service.enviarAlertasPendientes();

    expect(emailMock.enviarCorreoSimple).not.toHaveBeenCalled();
    expect(r.omitidos).toBe(1);
  });

  it('registra el envío como fallido (sin lanzar) si EmailService rechaza', async () => {
    emailMock.enviarCorreoSimple.mockRejectedValue(new Error('SMTP caído'));

    const r = await service.enviarAlertasPendientes();

    expect(prismaMock.alertaEnvio.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'fallido', error: expect.stringContaining('SMTP caído') }) }),
    );
    expect(r).toEqual({ enviados: 0, fallidos: 1, omitidos: 0 });
  });
});
