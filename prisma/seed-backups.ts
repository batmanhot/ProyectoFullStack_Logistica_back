// ═══════════════════════════════════════════════════════════════════
// Seed de datos de ejemplo — Backups / continuidad operativa
// (SuperAdmin → Plataforma → Backups)
//
// Registra respaldos por negocio + eventos + una solicitud de
// restauración en curso, para que el panel se vea poblado y se pueda
// probar el flujo (verificar → solicitar → aprobar → ejecutar).
//
// IDEMPOTENTE: borra lo que sembró antes (respaldos con
// creadoPor = 'seed@stockpro.dev', cascade sobre eventos y
// restauraciones) y lo vuelve a crear.
//
// Uso:  npm run seed:backups
// ═══════════════════════════════════════════════════════════════════
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MARCA = 'seed@stockpro.dev';
const dias = (n: number) => new Date(Date.now() + n * 86_400_000);
const GB = 1_000_000_000;

const ALCANCE_LABEL: Record<string, string> = {
  base_datos: 'Base de datos',
  base_datos_archivos: 'Base de datos y archivos',
  configuracion: 'Configuración SaaS',
};

interface Muestra {
  codigo: string;
  alcance: 'base_datos' | 'base_datos_archivos' | 'configuracion';
  tamanoGb: number;
  estado: 'VALIDANDO' | 'COMPLETADO' | 'FALLIDO';
  integridad: 'PENDIENTE' | 'VERIFICADO' | 'CON_OBSERVACIONES';
  hace: number; // días atrás
  // Si viene, se crea también una solicitud de restauración en este estado.
  restauracion?: {
    estado: 'PENDIENTE_APROBACION' | 'APROBADA' | 'RESTAURADA';
    motivo: string;
    contacto?: string;
    evidencia?: string;
  };
}

const MUESTRAS: Muestra[] = [
  { codigo: 'dlnorte', alcance: 'base_datos_archivos', tamanoGb: 1.2, estado: 'COMPLETADO', integridad: 'VERIFICADO', hace: 1 },
  { codigo: 'acme',    alcance: 'base_datos',          tamanoGb: 2.0, estado: 'COMPLETADO', integridad: 'VERIFICADO', hace: 1 },
  {
    codigo: 'abc', alcance: 'base_datos_archivos', tamanoGb: 2.8, estado: 'VALIDANDO', integridad: 'PENDIENTE', hace: 0,
    restauracion: {
      estado: 'PENDIENTE_APROBACION',
      motivo: 'El cliente eliminó por error un lote de productos y pide volver al estado del día anterior.',
    },
  },
  {
    codigo: 'xyz', alcance: 'base_datos_archivos', tamanoGb: 3.6, estado: 'COMPLETADO', integridad: 'VERIFICADO', hace: 2,
    restauracion: {
      estado: 'RESTAURADA',
      motivo: 'Migración fallida de datos maestros; se restauró el snapshot previo.',
      contacto: 'Luis Paredes — TI del cliente',
      evidencia: 'TICKET-7710 / acta 2026-09-08',
    },
  },
];

function destinoDe(nombre: string) {
  return { nombre: `Ubicación contratada · ${nombre}`, region: 'Object Storage · Sudamérica (Lima)', retencionDias: 90 };
}

async function main() {
  console.log('🌱 Seed de Backups (datos de ejemplo, DEV)');

  const previos = await prisma.respaldoNegocio.deleteMany({ where: { creadoPor: MARCA } });
  console.log(`  · Limpieza: ${previos.count} respaldo(s) de semilla previa (cascade eventos + restauraciones)`);

  const empresas = await prisma.empresa.findMany({ select: { id: true, codigo: true, nombre: true } });
  const porCodigo = new Map(empresas.map((e) => [e.codigo, e]));

  let n = 0;
  for (const m of MUESTRAS) {
    const empresa = porCodigo.get(m.codigo);
    if (!empresa) {
      console.log(`  ! Se omite "${m.codigo}": no existe el negocio (¿corriste el seed principal?)`);
      continue;
    }
    const destino = destinoDe(empresa.nombre);
    const creado = dias(-m.hace);

    const eventos: { tipo: string; detalle: string; actor: string; empresaId: string; fecha: Date }[] = [
      { tipo: 'respaldo_creado', detalle: `${ALCANCE_LABEL[m.alcance]} registrado en ${destino.nombre}`, actor: MARCA, empresaId: empresa.id, fecha: creado },
    ];
    if (m.integridad === 'VERIFICADO') {
      eventos.push({ tipo: 'integridad_verificada', detalle: 'Comprobación de restaurabilidad: verificado', actor: MARCA, empresaId: empresa.id, fecha: dias(-m.hace + 0.1) });
    }

    const respaldo = await prisma.respaldoNegocio.create({
      data: {
        empresaId: empresa.id,
        alcance: m.alcance,
        estado: m.estado,
        integridad: m.integridad,
        tamanoBytes: BigInt(Math.round(m.tamanoGb * GB)),
        destinoNombre: destino.nombre,
        destinoRegion: destino.region,
        retencionDias: destino.retencionDias,
        cifrado: true,
        creadoPor: MARCA,
        createdAt: creado,
        eventos: { create: eventos },
      },
    });

    let restauracionMsg = '';
    if (m.restauracion) {
      const rs = m.restauracion;
      const evs: { tipo: string; detalle: string; actor: string; respaldoId: string; empresaId: string; fecha: Date }[] = [
        { tipo: 'restauracion_solicitada', detalle: 'Solicitud creada; espera aprobación documentada del cliente', actor: MARCA, respaldoId: respaldo.id, empresaId: empresa.id, fecha: dias(-m.hace + 0.2) },
      ];
      if (rs.estado === 'APROBADA' || rs.estado === 'RESTAURADA') {
        evs.push({ tipo: 'aprobacion_registrada', detalle: `Aprobación del cliente registrada: ${rs.evidencia} (contacto: ${rs.contacto})`, actor: MARCA, respaldoId: respaldo.id, empresaId: empresa.id, fecha: dias(-m.hace + 0.3) });
      }
      if (rs.estado === 'RESTAURADA') {
        evs.push({ tipo: 'restauracion_ejecutada', detalle: 'Orden de restauración confirmada y registrada en auditoría', actor: MARCA, respaldoId: respaldo.id, empresaId: empresa.id, fecha: dias(-m.hace + 0.4) });
      }
      await prisma.solicitudRestauracion.create({
        data: {
          respaldoId: respaldo.id,
          empresaId: empresa.id,
          estado: rs.estado,
          motivo: rs.motivo,
          solicitadoPor: MARCA,
          aprobacionContacto: rs.contacto ?? null,
          aprobacionEvidencia: rs.evidencia ?? null,
          aprobadoEn: rs.estado === 'APROBADA' || rs.estado === 'RESTAURADA' ? dias(-m.hace + 0.3) : null,
          ejecutadoEn: rs.estado === 'RESTAURADA' ? dias(-m.hace + 0.4) : null,
          createdAt: dias(-m.hace + 0.2),
          eventos: { create: evs },
        },
      });
      restauracionMsg = `  + restauración [${rs.estado}]`;
    }

    n += 1;
    console.log(`  ✓ ${empresa.nombre}  ${ALCANCE_LABEL[m.alcance]}  ${m.tamanoGb} GB  [${m.estado}/${m.integridad}]${restauracionMsg}`);
  }

  console.log(`\n✅ ${n} respaldo(s) de ejemplo sembrados.`);
  console.log('   Panel: SuperAdmin → Plataforma → Backups');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
