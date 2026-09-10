// ═══════════════════════════════════════════════════════════════════
// Seed de datos de ejemplo — Facturación de la plataforma
// (SuperAdmin → Comercial → Facturación)
//
// Crea suscripciones (RenovacionPlan) y sus documentos de cobro
// (FacturaSaaS + EventoFacturaSaaS) enlazados, para que el panel se
// vea poblado y se pueda probar el flujo emitir → enviar → cobrar.
//
// Es IDEMPOTENTE: borra lo que sembró antes (renovaciones con
// comprobante `SEED-FACT-*` y sus facturas + las facturas FAC-009xxx)
// y lo vuelve a crear. NO toca datos creados a mano desde el panel.
//
// Uso:  npx ts-node prisma/seed-facturacion.ts
//   o:  npm run seed:facturacion
// ═══════════════════════════════════════════════════════════════════
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const IGV = 0.18;
const r2 = (n: number) => Math.round(n * 100) / 100;
const dias = (n: number) => new Date(Date.now() + n * 86_400_000);
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

// Marca para poder re-sembrar sin pisar datos reales.
const MARCA_RENOVACION = 'SEED-FACT-';

type PlanSeed = { planId: string; ciclo: 'mensual' | 'anual'; monto: number };

/**
 * Una "suscripción" de ejemplo + su factura.
 *  - `codigo`         : Empresa.codigo del negocio ya sembrado (dlnorte/acme/…)
 *  - `estadoRenov`    : PAGADO | PENDIENTE  (la renovación)
 *  - `factura.estado` : emitida | pagada | anulada  (vencida se DERIVA de venceEn)
 *  - `factura.venceEn`: Date  (si < hoy y estado 'emitida' ⇒ se muestra "Vencida")
 */
interface Muestra {
  codigo: string;
  plan: PlanSeed;
  comprobante: string;
  fechaPago: Date;
  periodoInicio: Date;
  periodoFin: Date;
  estadoRenov: 'PAGADO' | 'PENDIENTE';
  factura: {
    numero: string;
    estado: 'emitida' | 'pagada' | 'anulada';
    emitidaEn: Date;
    venceEn: Date;
    enviada: boolean;
    metodoPago?: string;
    referenciaPago?: string;
    pagadaEn?: Date;
    nota?: string;
  };
}

const MUESTRAS: Muestra[] = [
  // ── Distribuidora Lima Norte — al día ─────────────────────────────
  {
    codigo: 'dlnorte',
    plan: { planId: 'empresarial', ciclo: 'mensual', monto: 249 },
    comprobante: `${MARCA_RENOVACION}DLN-08`,
    fechaPago: iso(2026, 8, 5),
    periodoInicio: iso(2026, 8, 5),
    periodoFin: iso(2026, 9, 5),
    estadoRenov: 'PAGADO',
    factura: {
      numero: 'FAC-009001',
      estado: 'pagada',
      emitidaEn: iso(2026, 8, 5),
      venceEn: iso(2026, 8, 20),
      enviada: true,
      metodoPago: 'transferencia',
      referenciaPago: 'OP-4471028',
      pagadaEn: iso(2026, 8, 12),
    },
  },
  // ── Distribuidora Lima Norte — mes en curso, por cobrar ───────────
  {
    codigo: 'dlnorte',
    plan: { planId: 'empresarial', ciclo: 'mensual', monto: 249 },
    comprobante: `${MARCA_RENOVACION}DLN-09`,
    fechaPago: iso(2026, 9, 5),
    periodoInicio: iso(2026, 9, 5),
    periodoFin: iso(2026, 10, 5),
    estadoRenov: 'PENDIENTE',
    factura: {
      numero: 'FAC-009002',
      estado: 'emitida',
      emitidaEn: iso(2026, 9, 5),
      venceEn: dias(12),
      enviada: true,
      nota: 'Renovación mensual — pago comprometido para fin de mes.',
    },
  },
  // ── Acme Logística — contrato anual pagado ────────────────────────
  {
    codigo: 'acme',
    plan: { planId: 'empresarial', ciclo: 'anual', monto: 2390 },
    comprobante: `${MARCA_RENOVACION}ACME-ANUAL`,
    fechaPago: iso(2026, 7, 1),
    periodoInicio: iso(2026, 7, 1),
    periodoFin: iso(2027, 7, 1),
    estadoRenov: 'PAGADO',
    factura: {
      numero: 'FAC-009003',
      estado: 'pagada',
      emitidaEn: iso(2026, 7, 1),
      venceEn: iso(2026, 7, 16),
      enviada: true,
      metodoPago: 'tarjeta',
      referenciaPago: 'VISA-****4417',
      pagadaEn: iso(2026, 7, 3),
      nota: 'Contrato anual con 2 meses de descuento aplicados.',
    },
  },
  // ── Acme Logística — add-on mensual VENCIDO (requiere gestión) ─────
  {
    codigo: 'acme',
    plan: { planId: 'empresarial', ciclo: 'mensual', monto: 249 },
    comprobante: `${MARCA_RENOVACION}ACME-ADDON`,
    fechaPago: iso(2026, 8, 20),
    periodoInicio: iso(2026, 8, 20),
    periodoFin: iso(2026, 9, 20),
    estadoRenov: 'PENDIENTE',
    factura: {
      numero: 'FAC-009004',
      estado: 'emitida',
      emitidaEn: iso(2026, 8, 20),
      venceEn: dias(-6),
      enviada: false,
      nota: 'Usuarios adicionales fuera del plan base.',
    },
  },
  // ── Empresa XYZ — trial que pasó a Básico, luego anulada ──────────
  {
    codigo: 'xyz',
    plan: { planId: 'basico', ciclo: 'mensual', monto: 49 },
    comprobante: `${MARCA_RENOVACION}XYZ-01`,
    fechaPago: iso(2026, 9, 1),
    periodoInicio: iso(2026, 9, 1),
    periodoFin: iso(2026, 10, 1),
    estadoRenov: 'PENDIENTE',
    factura: {
      numero: 'FAC-009005',
      estado: 'anulada',
      emitidaEn: iso(2026, 9, 1),
      venceEn: iso(2026, 9, 16),
      enviada: true,
      nota: 'Anulada: el cliente decidió quedarse en trial una semana más.',
    },
  },
];

async function limpiar(numeros: string[]) {
  // 1) las facturas de esta semilla (por número explícito)
  const facturasBorradas = await prisma.facturaSaaS.deleteMany({ where: { numero: { in: numeros } } });
  // 2) cualquier factura colgada de una renovación de semilla previa
  const renovsPrevias = await prisma.renovacionPlan.findMany({
    where: { comprobante: { startsWith: MARCA_RENOVACION } },
    select: { id: true },
  });
  if (renovsPrevias.length) {
    await prisma.facturaSaaS.deleteMany({ where: { renovacionId: { in: renovsPrevias.map((r) => r.id) } } });
  }
  // 3) las renovaciones de semilla
  const renovsBorradas = await prisma.renovacionPlan.deleteMany({ where: { comprobante: { startsWith: MARCA_RENOVACION } } });
  console.log(`  · Limpieza: ${facturasBorradas.count} factura(s) + ${renovsBorradas.count} renovación(es) de semilla previa`);
}

async function main() {
  console.log('🌱 Seed de Facturación (datos de ejemplo, DEV)');

  const numeros = MUESTRAS.map((m) => m.factura.numero);
  await limpiar(numeros);

  const empresas = await prisma.empresa.findMany({ select: { id: true, codigo: true, nombre: true } });
  const planes = await prisma.planSaaS.findMany({ select: { id: true, nombre: true } });
  const porCodigo = new Map(empresas.map((e) => [e.codigo, e]));
  const planNombre = new Map(planes.map((p) => [p.id, p.nombre]));

  let creadas = 0;
  for (const m of MUESTRAS) {
    const empresa = porCodigo.get(m.codigo);
    if (!empresa) {
      console.log(`  ! Se omite ${m.factura.numero}: no existe el negocio "${m.codigo}" (¿corriste el seed principal?)`);
      continue;
    }
    const nombrePlan = planNombre.get(m.plan.planId) ?? m.plan.planId;

    // Suscripción (renovación de plan)
    const renovacion = await prisma.renovacionPlan.create({
      data: {
        empresaId: empresa.id,
        planId: m.plan.planId,
        monto: new Prisma.Decimal(m.plan.monto),
        moneda: 'PEN',
        ciclo: m.plan.ciclo,
        fechaPago: m.fechaPago,
        metodoPago: m.factura.metodoPago ?? 'transferencia',
        periodoInicio: m.periodoInicio,
        periodoFin: m.periodoFin,
        estado: m.estadoRenov,
        comprobante: m.comprobante,
      },
    });

    const subtotal = r2(m.plan.monto);
    const igv = r2(subtotal * IGV);
    const total = r2(subtotal + igv);

    // Eventos del documento — la línea de tiempo que se ve en el detalle.
    const eventos: Prisma.EventoFacturaSaaSCreateWithoutFacturaInput[] = [
      { tipo: 'emitida', detalle: 'Documento generado desde la suscripción', monto: new Prisma.Decimal(total), fecha: m.factura.emitidaEn },
    ];
    if (m.factura.enviada) {
      eventos.push({ tipo: 'enviada', detalle: 'Documento marcado como enviado al cliente', monto: new Prisma.Decimal(total), fecha: dias(-3) });
    }
    if (m.factura.estado === 'pagada' && m.factura.pagadaEn) {
      eventos.push({
        tipo: 'cobro_registrado',
        detalle: `Cobro confirmado · ${m.factura.referenciaPago ?? ''}`.trim(),
        monto: new Prisma.Decimal(total),
        fecha: m.factura.pagadaEn,
      });
    }
    if (m.factura.estado === 'anulada') {
      eventos.push({ tipo: 'anulada', detalle: 'Documento anulado por el SuperAdmin', monto: new Prisma.Decimal(total), fecha: dias(-1) });
    }

    await prisma.facturaSaaS.create({
      data: {
        numero: m.factura.numero,
        empresaId: empresa.id,
        renovacionId: renovacion.id,
        planId: m.plan.planId,
        planNombre: nombrePlan,
        ciclo: m.plan.ciclo,
        moneda: 'PEN',
        subtotal: new Prisma.Decimal(subtotal),
        igv: new Prisma.Decimal(igv),
        total: new Prisma.Decimal(total),
        emitidaEn: m.factura.emitidaEn,
        venceEn: m.factura.venceEn,
        enviadaEn: m.factura.enviada ? dias(-3) : null,
        estado: m.factura.estado.toUpperCase() as 'EMITIDA' | 'PAGADA' | 'ANULADA',
        metodoPago: m.factura.estado === 'pagada' ? (m.factura.metodoPago ?? 'transferencia') : null,
        referenciaPago: m.factura.estado === 'pagada' ? (m.factura.referenciaPago ?? null) : null,
        pagadaEn: m.factura.estado === 'pagada' ? (m.factura.pagadaEn ?? null) : null,
        nota: m.factura.nota ?? null,
        eventos: { create: eventos },
      },
    });

    creadas += 1;
    console.log(`  ✓ ${m.factura.numero}  ${empresa.nombre}  ${nombrePlan}/${m.plan.ciclo}  S/ ${total.toFixed(2)}  [${m.factura.estado}]`);
  }

  console.log(`\n✅ ${creadas} suscripción(es) + factura(s) de ejemplo sembradas.`);
  console.log('   Panel: SuperAdmin → Comercial → Facturación');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
