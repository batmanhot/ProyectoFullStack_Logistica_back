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
      planSaaS: { findMany: vi.fn().mockResolvedValue([]) },
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

describe('AlertasService.enviarAlertasPendientes — envío real', () => {
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
      planSaaS: { findMany: vi.fn().mockResolvedValue([{ id: 'pro', nombre: 'Pro' }]) },
      alertaEnvio: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), findMany: vi.fn() },
    };
    emailMock = { enviarCorreoSimple: vi.fn().mockResolvedValue(undefined) };
    service = new AlertasService(prismaMock, emailMock);
  });

  it('envía el correo con las variables reemplazadas (incluye {plan} = nombre real) y registra el envío', async () => {
    const r = await service.enviarAlertasPendientes();

    expect(emailMock.enviarCorreoSimple).toHaveBeenCalledWith({
      destinatarioEmail: 'cliente@a.com',
      asunto: 'Tu plan Pro vence',
      mensaje: 'Hola Cliente A, faltan 15 días',
    });
    expect(prismaMock.alertaEnvio.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ empresaId: 'e1', reglaId: 'r1', canal: 'email', estado: 'enviado' }) }),
    );
    expect(r).toEqual({ enviados: 1, fallidos: 0, omitidos: 0 });
  });

  it('nunca escribe un {dias} negativo — un vencido en rango de una regla dice "hoy"', async () => {
    prismaMock.empresa.findMany.mockResolvedValue([{ ...empresa, fechaVencimiento: new Date(Date.now() - 3 * 86400000) }]);

    await service.enviarAlertasPendientes();

    expect(emailMock.enviarCorreoSimple).toHaveBeenCalledWith(
      expect.objectContaining({ mensaje: 'Hola Cliente A, faltan hoy días' }),
    );
  });

  it('no reenvía si ya existe un AlertaEnvio para (empresa, regla, fechaVencimiento vigente)', async () => {
    prismaMock.alertaEnvio.findUnique.mockResolvedValue({ id: 'ya-existe' });

    const r = await service.enviarAlertasPendientes();

    expect(emailMock.enviarCorreoSimple).not.toHaveBeenCalled();
    expect(r.omitidos).toBe(1);
  });

  it('omite (sin intentar) una regla sin canal "email"', async () => {
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

describe('AlertasService.salud — bandeja unificada', () => {
  let prismaMock: any;
  let service: AlertasService;

  const txMock = {
    usuario: { count: vi.fn().mockResolvedValue(0) },
    almacen: { count: vi.fn().mockResolvedValue(0) },
    producto: { count: vi.fn().mockResolvedValue(0) },
    proveedor: { count: vi.fn().mockResolvedValue(0) },
    cliente: { count: vi.fn().mockResolvedValue(0) },
  };

  beforeEach(() => {
    for (const m of Object.values(txMock)) m.count.mockResolvedValue(0);
    prismaMock = {
      empresa: { findMany: vi.fn().mockResolvedValue([]) },
      reglaAlertaVencimiento: { findMany: vi.fn().mockResolvedValue([{ id: 'r1', asunto: 'Aviso', canales: ['email'], activa: true, eliminada: false }]) },
      alertaEstado: { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn(), deleteMany: vi.fn() },
      incidenteMonitor: { findMany: vi.fn().mockResolvedValue([]) },
      // Backup reciente OK por defecto (no dispara la alerta de "backup atrasado").
      respaldoNegocio: { findFirst: vi.fn().mockResolvedValue({ createdAt: new Date() }) },
      pruebaRestauracion: { findFirst: vi.fn().mockResolvedValue(null) },
      planSaaS: { findMany: vi.fn().mockResolvedValue([{ id: 'pro', nombre: 'Pro', maxUsuarios: 2, maxAlmacenes: -1, maxProductos: -1, maxProveedores: -1, maxClientes: -1 }]) },
      alertaEnvio: { groupBy: vi.fn().mockResolvedValue([]) },
      withTenant: vi.fn((_id: string, fn: any) => fn(txMock)),
    };
    service = new AlertasService(prismaMock, {} as any);
  });

  it('genera una alerta crítica de vencimiento para un negocio vencido', async () => {
    prismaMock.empresa.findMany.mockResolvedValue([
      { id: 'e1', nombre: 'Vencida', estado: 'activo', plan: 'pro', email: 'a@a.com', activo: true, fechaVencimiento: new Date(Date.now() - 40 * 86400000) },
    ]);

    const alertas = await service.salud();
    const venc = alertas.find((a) => a.categoria === 'vencimiento');
    expect(venc).toBeDefined();
    expect(venc!.severidad).toBe('critica');
    expect(venc!.empresaId).toBe('e1');
  });

  it('genera "limite_excedido" cuando el uso supera el tope del plan', async () => {
    prismaMock.empresa.findMany.mockResolvedValue([
      { id: 'e1', nombre: 'Grande', estado: 'activo', plan: 'pro', email: 'a@a.com', activo: true, fechaVencimiento: new Date(Date.now() + 200 * 86400000) },
    ]);
    txMock.usuario.count.mockResolvedValue(5); // plan pro maxUsuarios = 2

    const alertas = await service.salud();
    const lim = alertas.find((a) => a.categoria === 'limite_excedido');
    expect(lim).toBeDefined();
    expect(lim!.clave).toBe('limite_excedido:e1:usuarios');
    expect(lim!.titulo).toContain('5/2');
  });

  it('marca como "resuelta" la alerta cuya clave tiene un AlertaEstado persistido', async () => {
    prismaMock.empresa.findMany.mockResolvedValue([
      { id: 'e1', nombre: 'Grande', estado: 'activo', plan: 'pro', email: 'a@a.com', activo: true, fechaVencimiento: new Date(Date.now() + 200 * 86400000) },
    ]);
    txMock.usuario.count.mockResolvedValue(5);
    prismaMock.alertaEstado.findMany.mockResolvedValue([
      { clave: 'limite_excedido:e1:usuarios', estado: 'resuelta', nota: 'ya avisado', silenciadaHasta: null },
    ]);

    const alertas = await service.salud();
    const lim = alertas.find((a) => a.clave === 'limite_excedido:e1:usuarios');
    expect(lim!.estado).toBe('resuelta');
    expect(lim!.nota).toBe('ya avisado');
  });

  it('alerta de configuración cuando no hay reglas activas', async () => {
    prismaMock.reglaAlertaVencimiento.findMany.mockResolvedValue([]);

    const alertas = await service.salud();
    expect(alertas.some((a) => a.clave === 'configuracion:sin_reglas')).toBe(true);
  });
});
