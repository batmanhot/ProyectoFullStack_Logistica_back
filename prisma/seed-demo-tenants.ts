/**
 * Negocios DEMO — SOLO para instancias de demostración comercial y desarrollo
 * local. NUNCA corre en una producción real de un cliente.
 *
 *   npm run seed:demo-tenants
 *
 * - Gate: solo hace algo si SEED_DEMO_TENANTS === 'true'.
 * - No lo llama `db:setup-prod` ni `bootstrap-render` salvo que esa instancia
 *   declare explícitamente SEED_DEMO_TENANTS=true (una instancia de demo).
 * - La contraseña sale de DEMO_TENANT_PASSWORD. Sin esa variable: en un entorno
 *   productivo el script se niega a correr; fuera de producción cae a un valor
 *   de dev conocido con aviso.
 *
 * Crea `dlnorte` y `acme` con un usuario por rol (para probar las tarjetas de
 * acceso rápido del Login) + el área "Operaciones" que necesita el rol
 * 'solicitante'. Los roles base, planes y el PlatformAdmin los siembra
 * `prisma/seed.ts` (bootstrap de plataforma) — este script asume que ya corrió.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { sembrarReglasAprobacion } from '../src/common/aprobacion-procesos';

const prisma = new PrismaClient();

const EMPRESAS_DEMO = [
  {
    codigo: 'dlnorte',
    nombre: 'Distribuidora Lima Norte',
    ruc: '20100000001',
    email: 'contacto@dlnorte.demo',
    origen: 'demo',
    plan: 'empresarial',
    usuarios: [
      { email: 'owner@dlnorte.demo', nombre: 'Propietario DL Norte', rolCodigo: 'owner' },
      { email: 'admin@dlnorte.demo', nombre: 'Admin DL Norte', rolCodigo: 'admin' },
      { email: 'gerente@dlnorte.demo', nombre: 'Gerente Operaciones DL Norte', rolCodigo: 'gerente-operaciones' },
      { email: 'supervisor@dlnorte.demo', nombre: 'Supervisor DL Norte', rolCodigo: 'supervisor' },
      { email: 'almacenero@dlnorte.demo', nombre: 'Almacenero DL Norte', rolCodigo: 'almacenero' },
      { email: 'despachador@dlnorte.demo', nombre: 'Despachador DL Norte', rolCodigo: 'despachador' },
      { email: 'compras@dlnorte.demo', nombre: 'Analista Compras DL Norte', rolCodigo: 'analista-compras' },
      { email: 'comercial@dlnorte.demo', nombre: 'Ejecutivo Comercial DL Norte', rolCodigo: 'ejecutivo-comercial' },
      { email: 'comercial2@dlnorte.demo', nombre: 'Carla Mendoza', rolCodigo: 'ejecutivo-comercial' },
      { email: 'transporte@dlnorte.demo', nombre: 'Coordinador Transporte DL Norte', rolCodigo: 'coordinador-transporte' },
      { email: 'chofer@dlnorte.demo', nombre: 'Chofer DL Norte', rolCodigo: 'chofer' },
      { email: 'contable@dlnorte.demo', nombre: 'Contable DL Norte', rolCodigo: 'contable-finanzas' },
      { email: 'auditor@dlnorte.demo', nombre: 'Auditor DL Norte', rolCodigo: 'auditor' },
      { email: 'solicitante@dlnorte.demo', nombre: 'Solicitante DL Norte', rolCodigo: 'solicitante' },
    ],
  },
  {
    codigo: 'acme',
    nombre: 'Acme Logística S.A.C.',
    ruc: '20100000002',
    email: 'contacto@acme.demo',
    origen: 'demo',
    plan: 'empresarial',
    usuarios: [
      { email: 'owner@acme.demo', nombre: 'Propietario Acme', rolCodigo: 'owner' },
      { email: 'admin@acme.demo', nombre: 'Admin Acme', rolCodigo: 'admin' },
      { email: 'gerente@acme.demo', nombre: 'Gerente Operaciones Acme', rolCodigo: 'gerente-operaciones' },
      { email: 'supervisor@acme.demo', nombre: 'Supervisor Acme', rolCodigo: 'supervisor' },
      { email: 'almacenero@acme.demo', nombre: 'Almacenero Acme', rolCodigo: 'almacenero' },
      { email: 'despachador@acme.demo', nombre: 'Despachador Acme', rolCodigo: 'despachador' },
      { email: 'compras@acme.demo', nombre: 'Analista Compras Acme', rolCodigo: 'analista-compras' },
      { email: 'comercial@acme.demo', nombre: 'Ejecutivo Comercial Acme', rolCodigo: 'ejecutivo-comercial' },
      { email: 'transporte@acme.demo', nombre: 'Coordinador Transporte Acme', rolCodigo: 'coordinador-transporte' },
      { email: 'contable@acme.demo', nombre: 'Contable Acme', rolCodigo: 'contable-finanzas' },
      { email: 'auditor@acme.demo', nombre: 'Auditor Acme', rolCodigo: 'auditor' },
      { email: 'solicitante@acme.demo', nombre: 'Solicitante Acme', rolCodigo: 'solicitante' },
    ],
  },
];

function resolverPassword(): string {
  const fromEnv = process.env.DEMO_TENANT_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '✗ DEMO_TENANT_PASSWORD es obligatoria para sembrar negocios demo en un entorno productivo.',
    );
    process.exit(1);
  }
  const dev = 'StockPro2026!';
  console.warn(`⚠  DEMO_TENANT_PASSWORD no definida — usando valor de desarrollo "${dev}".`);
  return dev;
}

async function main() {
  if (process.env.SEED_DEMO_TENANTS !== 'true') {
    console.log('· SEED_DEMO_TENANTS != "true" — no se siembran negocios demo. (Es lo correcto en producción real.)');
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    console.warn('⚠  Sembrando negocios DEMO en NODE_ENV=production — solo válido para una instancia de DEMOSTRACIÓN comercial.');
  }

  console.log('🌱 Seed de negocios DEMO (dlnorte / acme)');
  const passwordHash = await bcrypt.hash(resolverPassword(), 12);

  for (const e of EMPRESAS_DEMO) {
    let empresa = await prisma.empresa.upsert({
      where: { codigo: e.codigo },
      update: {},
      create: { codigo: e.codigo, nombre: e.nombre, ruc: e.ruc, email: e.email, origen: e.origen, plan: e.plan },
    });
    if (empresa.plan === 'starter') {
      empresa = await prisma.empresa.update({ where: { id: empresa.id }, data: { plan: e.plan } });
    }
    console.log(`  ✓ Empresa: ${empresa.nombre} (${empresa.codigo}) — plan ${empresa.plan}`);

    await sembrarReglasAprobacion(prisma, empresa.id);

    const areaOps = await prisma.areaInterna.upsert({
      where: { empresaId_codigo: { empresaId: empresa.id, codigo: 'OPS' } },
      update: {},
      create: { empresaId: empresa.id, nombre: 'Operaciones', codigo: 'OPS' },
    });

    for (const u of e.usuarios) {
      const rol = await prisma.rol.findFirst({ where: { empresaId: null, codigo: u.rolCodigo } });
      if (!rol) {
        console.warn(`  ⚠  Rol base "${u.rolCodigo}" inexistente — corré primero \`npm run prisma:seed\`. Se omite ${u.email}.`);
        continue;
      }
      await prisma.usuario.upsert({
        where: { empresaId_email: { empresaId: empresa.id, email: u.email } },
        update: { areaId: u.rolCodigo === 'solicitante' ? areaOps.id : undefined },
        create: {
          empresaId: empresa.id,
          nombre: u.nombre,
          email: u.email,
          passwordHash,
          rolId: rol.id,
          areaId: u.rolCodigo === 'solicitante' ? areaOps.id : undefined,
        },
      });
      console.log(`  ✓ Usuario ${u.rolCodigo}: ${u.email}`);
    }
  }

  console.log('✅ Negocios demo sembrados.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
