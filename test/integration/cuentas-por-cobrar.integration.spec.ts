import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CuentasPorCobrarService } from '../../src/cuentas-por-cobrar/cuentas-por-cobrar.service';
import { dbOwner, nuevoPrismaService, crearFixtureEmpresa, limpiarFixtureEmpresa } from './setup';

describe('CuentasPorCobrarService (integración, Postgres real)', () => {
  let prisma: ReturnType<typeof nuevoPrismaService>;
  let service: CuentasPorCobrarService;
  let fx: Awaited<ReturnType<typeof crearFixtureEmpresa>>;

  beforeAll(async () => {
    prisma = nuevoPrismaService();
    await prisma.$connect();
    service = new CuentasPorCobrarService(prisma);
    fx = await crearFixtureEmpresa('cxc');
  });

  afterAll(async () => {
    await limpiarFixtureEmpresa(fx.empresaId);
    await prisma.$disconnect();
    await dbOwner.$disconnect();
  });

  it('dos pagos parciales hasta cubrir el saldo dejan la cuenta COBRADA', async () => {
    const cuenta = await service.create(fx.empresaId, { clienteId: fx.clienteId, monto: 100 } as any);
    expect(Number(cuenta.saldo)).toBe(100);
    expect(cuenta.estado).toBe('PENDIENTE');

    // registrarPago() devuelve el PagoCxC creado, no la cuenta — se relee
    // la cuenta para verificar el efecto del pago sobre saldo/estado.
    const pago1 = await service.registrarPago(fx.empresaId, cuenta.id, { monto: 60 } as any);
    expect(Number(pago1.monto)).toBe(60);
    const cuentaTras1 = await service.findOne(fx.empresaId, cuenta.id);
    expect(Number(cuentaTras1.saldo)).toBe(40);
    expect(cuentaTras1.estado).toBe('PARCIAL');

    await service.registrarPago(fx.empresaId, cuenta.id, { monto: 40 } as any);
    const cuentaTras2 = await service.findOne(fx.empresaId, cuenta.id);
    expect(Number(cuentaTras2.saldo)).toBe(0);
    expect(cuentaTras2.estado).toBe('COBRADA');

    const pagos = await dbOwner.pagoCxC.findMany({ where: { cuentaId: cuenta.id } });
    expect(pagos).toHaveLength(2);
  });

  it('rechaza un pago mayor al saldo pendiente', async () => {
    const cuenta = await service.create(fx.empresaId, { clienteId: fx.clienteId, monto: 50 } as any);

    await expect(
      service.registrarPago(fx.empresaId, cuenta.id, { monto: 999 } as any),
    ).rejects.toThrow(/no puede superar el saldo pendiente/);
  });

  it('rechaza un pago sobre una cuenta ya COBRADA', async () => {
    const cuenta = await service.create(fx.empresaId, { clienteId: fx.clienteId, monto: 20 } as any);
    await service.registrarPago(fx.empresaId, cuenta.id, { monto: 20 } as any);

    await expect(
      service.registrarPago(fx.empresaId, cuenta.id, { monto: 1 } as any),
    ).rejects.toThrow(/ya está completamente cobrada/);
  });
});
