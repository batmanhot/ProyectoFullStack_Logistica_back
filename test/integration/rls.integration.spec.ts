import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dbOwner, nuevoPrismaService, crearFixtureEmpresa, limpiarFixtureEmpresa } from './setup';

// Confirma con una query REAL (no mockeada) que las políticas RLS de
// prisma/sql/enable_rls_fase*.sql aplican de verdad para el rol stockpro_app
// (ver PrismaService.withTenant) — complementa los tests unitarios, que
// mockean Prisma y no pueden atrapar un bug de SQL/RLS.
describe('Aislamiento de tenant vía RLS (integración, Postgres real)', () => {
  let prisma: ReturnType<typeof nuevoPrismaService>;
  let fxA: Awaited<ReturnType<typeof crearFixtureEmpresa>>;
  let fxB: Awaited<ReturnType<typeof crearFixtureEmpresa>>;

  beforeAll(async () => {
    prisma = nuevoPrismaService();
    await prisma.$connect();
    fxA = await crearFixtureEmpresa('rlsA');
    fxB = await crearFixtureEmpresa('rlsB');
  });

  afterAll(async () => {
    await limpiarFixtureEmpresa(fxA.empresaId);
    await limpiarFixtureEmpresa(fxB.empresaId);
    await prisma.$disconnect();
    await dbOwner.$disconnect();
  });

  it('withTenant(A) no ve los productos de la empresa B, aunque no se filtre por empresaId en el where', async () => {
    // A propósito SIN empresaId en el where — si RLS no aplicara, esto
    // devolvería productos de ambos tenants (bypass del hallazgo Crítico #1).
    const productosDesdeA = await prisma.withTenant(fxA.empresaId, (tx) => tx.producto.findMany({}));

    expect(productosDesdeA.map((p) => p.id)).toContain(fxA.productoId);
    expect(productosDesdeA.map((p) => p.id)).not.toContain(fxB.productoId);
  });

  it('withTenant(B) no ve ni puede actualizar un cliente de la empresa A por su id', async () => {
    const resultado = await prisma.withTenant(fxB.empresaId, (tx) =>
      tx.cliente.updateMany({ where: { id: fxA.clienteId }, data: { notas: 'intento cross-tenant' } }),
    );
    // RLS filtra la fila antes del UPDATE — 0 filas afectadas, no un error.
    expect(resultado.count).toBe(0);

    const clienteIntacto = await dbOwner.cliente.findUniqueOrThrow({ where: { id: fxA.clienteId } });
    expect(clienteIntacto.notas).not.toBe('intento cross-tenant');
  });

  it('rechaza un empresaId no alfanumérico antes de interpolarlo en SET LOCAL (SAFE_ID_PATTERN)', async () => {
    // withTenant() arma `SET LOCAL app.current_tenant = '<empresaId>'` con
    // interpolación de string (Postgres no admite bind params en SET) — sin
    // esta validación, esto sería una inyección SQL directa.
    await expect(
      prisma.withTenant(`${fxA.empresaId}'; DROP TABLE productos; --`, (tx) => tx.producto.findMany({})),
    ).rejects.toThrow();
  });
});
