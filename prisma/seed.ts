// ═══════════════════════════════════════════════════════════════════
// StockPro API — Seed (Fase 1 + Fase 7d)
// Crea: 2 empresas demo (dlnorte, acme) + catálogo base de roles
// (global, empresaId = null) + 1 usuario admin por empresa + 1
// PlatformAdmin de prueba + catálogo base de PlanSaaS (Fase 7d) +
// configuración de Landing Page con copy orientado a venta.
//
// Las contraseñas demo son solo para desarrollo local — NUNCA usar
// estos valores en un entorno expuesto a internet.
// ═══════════════════════════════════════════════════════════════════
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Catálogo base de roles (sección 3, hallazgo #4 del documento de backend).
// empresaId = null ⇒ visibles para cualquier tenant vía la política RLS de roles.
// Fase 2 (catálogo de roles como plantilla SaaS) — vocabulario granular de
// módulos (mismo que Sidebar.jsx / MODULOS_GRUPOS en Usuarios.jsx), NO el de
// 9 grupos gruesos de PlanSaaS.modulosIncluidos (ese es el eje de plan, se
// cruzan recién en la Fase 3). "supervisor"/"almacenero" mantienen su código
// para no romper Usuario.rolId de cuentas existentes — solo se redefinen su
// label y permisos, tal como aprobó el usuario en el informe de roles.
const ROLES_BASE: { codigo: string; label: string; permisos: string[] }[] = [
  { codigo: 'owner', label: 'Propietario', permisos: ['*'] },
  { codigo: 'admin', label: 'Administrador', permisos: ['*'] },
  {
    codigo: 'gerente-operaciones',
    label: 'Gerente de Operaciones',
    permisos: [
      'dashboard', 'alertas',
      'inventario', 'kardex', 'inv-fisico',
      'entradas', 'salidas', 'devoluciones', 'transferencias',
      'ordenes', 'cotizaciones', 'proveedores',
      'clientes', 'despachos', 'pedidos-internos', 'empaque', 'transportes', 'flota',
      'movimientos', 'vencimientos', 'reorden', 'prevision', 'reportes', 'kpis',
      'mapa-almacen', 'lotes-series', 'lista-precios',
      // Auditoría de seguridad 2026-07-29 (Hallazgo Alto #7): gestión de
      // catálogos/estructura — antes sin gating, ahora requieren estos permisos.
      'almacenes', 'categorias', 'areas-internas',
      // Fase 10 (Gestión Comercial, 2026-08-31): visibilidad del pipeline
      // comercial para el mando operativo, no solo para el ejecutivo de ventas.
      'oportunidades',
      // Gestión de Pedidos por Proyecto (2026-09-04): puede VER el reporte de
      // consumo por proyecto/CDR, pero no gestionar el catálogo de Proyecto/
      // CDR — eso queda exclusivo de Admin/Owner (permiso 'proyectos', que
      // este rol no tiene).
      'reportes-proyecto',
    ],
  },
  {
    codigo: 'supervisor',
    label: 'Supervisor de Almacén',
    permisos: [
      'dashboard', 'alertas',
      'inventario', 'kardex', 'inv-fisico',
      'entradas', 'salidas', 'ajustes', 'devoluciones', 'transferencias',
      'movimientos', 'vencimientos', 'reorden',
      'mapa-almacen', 'lotes-series', 'reportes',
      // Auditoría de seguridad 2026-07-29 (Hallazgo Alto #7): "Supervisor de
      // Almacén" es, por definición, quien gestiona almacenes y categorías.
      'almacenes', 'categorias',
      // 2026-09-04: ni Supervisor ni Almacenero (abajo) tenían este permiso —
      // ninguno de los dos roles que trabajan en el almacén físico podía ver
      // Pedidos Internos, pese a que son quienes preparan y entregan esas
      // solicitudes. Aprobar/Rechazar queda restringido a Supervisor+ vía
      // @SoloRoles en el controller — Almacenero/Despachador solo ejecutan
      // (Picking/Entregar), no autorizan el gasto.
      'pedidos-internos',
    ],
  },
  {
    codigo: 'almacenero',
    label: 'Operario de Almacén',
    permisos: [
      'dashboard', 'alertas',
      'inventario', 'kardex', 'inv-fisico',
      'entradas', 'salidas', 'devoluciones', 'transferencias',
      'movimientos', 'mapa-almacen',
      // Auditoría de seguridad 2026-07-29 (Hallazgo Alto #7): puede clasificar
      // productos en categorías; crear/borrar almacenes completos sigue
      // siendo exclusivo de Supervisor/Gerente (mismo criterio que 'ajustes').
      'categorias',
      // Fase 1 vista móvil (2026-08-05): el Almacenero necesita ver el pipeline
      // de despachos y operar el picking desde el hub móvil — antes no tenía
      // ninguno de los dos y el backend le devolvía 403 en /picking/*.
      'despachos', 'picking',
      // Mismo hallazgo: ya tenía 'alertas', pero sin 'ordenes' ni 'lotes-series'
      // las alertas de OC pendiente y de vencimiento de lote quedaban 403 —
      // la página de Alertas de escritorio también estaba rota para este rol,
      // no solo el hub móvil nuevo.
      'ordenes', 'lotes-series',
      // 2026-09-04 — ver nota en 'supervisor' arriba. Puede preparar/entregar
      // (Picking/Entregar) pero no Aprobar/Rechazar (@SoloRoles lo restringe).
      'pedidos-internos',
    ], // sin 'ajustes' ni 'almacenes' — autoridad exclusiva del Supervisor de Almacén
  },
  {
    // 2026-09-04: puesto real en algunas operaciones (no todas) — alguien
    // dedicado exclusivamente a preparar y entregar, sin gestionar inventario
    // (no recibe, no ajusta, no cuenta, no transfiere). A diferencia de
    // 'almacenero', que es dueño de todo el piso de almacén, este rol es
    // deliberadamente angosto: solo la ejecución del despacho/entrega, tanto
    // a clientes (Despachos) como a áreas internas (Pedidos Internos). No
    // puede Aprobar/Rechazar Pedidos Internos (@SoloRoles lo reserva a
    // Supervisor+), ni tiene 'inventario'/'entradas'/'ajustes'/etc.
    codigo: 'despachador',
    label: 'Despachador',
    permisos: ['dashboard', 'alertas', 'despachos', 'picking', 'pedidos-internos', 'transportes'],
  },
  {
    codigo: 'analista-compras',
    label: 'Analista de Compras',
    permisos: ['dashboard', 'alertas', 'ordenes', 'cotizaciones', 'proveedores', 'inventario', 'reportes', 'categorias'],
  },
  {
    codigo: 'ejecutivo-comercial',
    label: 'Ejecutivo Comercial',
    // 'inventario' agregado 2026-09-04: sin esto, Proformas no puede listar
    // productos para cotizar (el guard de permisos es todo-o-nada por
    // módulo, no hay lectura parcial) — decisión del dueño del producto:
    // acceso completo a Productos es aceptable para este rol.
    // Auditoría 2026-09-03: se quitó 'reportes' (abre Análisis de Inventario
    // Y Reportes Contables bajo el mismo módulo — ninguna de las dos es del
    // dominio comercial, y ambas quedaban rotas por faltarle 'movimientos'/
    // 'almacenes'/'ordenes'/'despachos'/'proveedores'). Se agregó 'almacenes'
    // (mínimo necesario para que Portal de Pedidos pueda aprobar un pedido
    // eligiendo almacén de despacho, ver PortalPedidos.jsx).
    permisos: ['dashboard', 'alertas', 'clientes', 'proformas', 'cxc', 'portal-pedidos', 'lista-precios', 'oportunidades', 'inventario', 'almacenes'],
  },
  {
    codigo: 'coordinador-transporte',
    label: 'Coordinador de Transporte',
    permisos: ['dashboard', 'alertas', 'despachos', 'transportes', 'flota', 'clientes', 'reportes'],
  },
  {
    // Fase 3 vista móvil (2026-08-05): rol de piso para el transportista —
    // confirma la entrega de SUS despachos asignados (Usuario.transportistaId,
    // ver schema.prisma) desde el hub móvil. 'transportes' se sumó el
    // 2026-08-06 para que además vea y gestione SUS rutas asignadas
    // (Transportes > Rutas y Salidas, botón "Confirmar Entrega" por parada);
    // el frontend restringe esa pantalla para chofer a solo sus rutas y
    // oculta Nueva Ruta/Cancelar/Transportistas — no administra el módulo.
    codigo: 'chofer',
    label: 'Chofer',
    permisos: ['dashboard', 'alertas', 'despachos', 'transportes'],
  },
  {
    codigo: 'contable-finanzas',
    label: 'Contable / Finanzas',
    permisos: ['dashboard', 'alertas', 'sunat', 'financiero', 'cxc', 'reportes', 'kpis'],
  },
  {
    codigo: 'solicitante',
    label: 'Solicitante',
    // 'dashboard' agregado 2026-09-04: todo rol debe tener su propio panel
    // de gestión (ver DashboardSolicitante) — sin este permiso el ítem
    // "Dashboard" ni siquiera aparecía en su menú lateral.
    permisos: ['dashboard', 'pedidos-internos'],
  },
  {
    codigo: 'auditor',
    label: 'Auditor',
    // Sin ningún módulo operativo — solo el panel de solo lectura (ver
    // panel-auditoria.controller.ts, que no expone ninguna ruta de escritura).
    permisos: ['dashboard', 'panel-auditoria'],
  },
];

// Los negocios DEMO (dlnorte / acme) YA NO se siembran acá — este script es
// solo bootstrap de plataforma (roles base, planes, PlatformAdmin, landing,
// PlataformaConfig). Para una instancia de demostración comercial o desarrollo
// local, los negocios demo se siembran aparte con `npm run seed:demo-tenants`
// (prisma/seed-demo-tenants.ts, gate SEED_DEMO_TENANTS=true). Una producción
// real de cliente no los tiene.

const PLANES_BASE: Array<{
  id: string;
  nombre: string;
  precioMensual: number;
  precioAnual: number;
  destacado?: boolean;
  caracteristicas: string[];
  maxUsuarios: number;
  maxProductos: number;
  maxAlmacenes: number;
  maxProveedores: number;
  maxClientes: number;
  maxOrdenesMes: number;
  almacenamientoGB: number;
  soporte: string;
  apiAccess: boolean;
  multiEmpresa: boolean;
  exportAvanzada: boolean;
  reportesAvanzados: boolean;
  modulosIncluidos: string[];
  esPublico: boolean;
}> = [
  {
    id: 'trial',
    nombre: 'Prueba gratuita',
    precioMensual: 0,
    precioAnual: 0,
    caracteristicas: ['14 días de prueba', '1 almacén', 'Soporte por email'],
    maxUsuarios: 2,
    maxProductos: 50,
    maxAlmacenes: 1,
    maxProveedores: 5,
    maxClientes: 10,
    maxOrdenesMes: 20,
    almacenamientoGB: 1,
    soporte: 'email',
    apiAccess: false,
    multiEmpresa: false,
    exportAvanzada: false,
    reportesAvanzados: false,
    modulosIncluidos: ['inventario', 'operaciones', 'despachos'],
    esPublico: true,
  },
  {
    id: 'basico',
    nombre: 'Básico',
    precioMensual: 49,
    precioAnual: 470,
    caracteristicas: ['Hasta 5 usuarios', '2 almacenes', 'Soporte por email'],
    maxUsuarios: 5,
    maxProductos: 500,
    maxAlmacenes: 2,
    maxProveedores: 30,
    maxClientes: 100,
    maxOrdenesMes: 200,
    almacenamientoGB: 5,
    soporte: 'email',
    apiAccess: false,
    multiEmpresa: false,
    exportAvanzada: false,
    reportesAvanzados: false,
    modulosIncluidos: ['inventario', 'operaciones', 'despachos', 'compras'],
    esPublico: true,
  },
  {
    id: 'profesional',
    nombre: 'Profesional',
    precioMensual: 99,
    precioAnual: 950,
    destacado: true,
    caracteristicas: ['Usuarios ilimitados', '5 almacenes', 'Soporte prioritario', 'Reportes avanzados'],
    maxUsuarios: -1,
    maxProductos: 5000,
    maxAlmacenes: 5,
    maxProveedores: 200,
    maxClientes: 1000,
    maxOrdenesMes: 2000,
    almacenamientoGB: 20,
    soporte: 'prioritario',
    apiAccess: true,
    multiEmpresa: false,
    exportAvanzada: true,
    reportesAvanzados: true,
    modulosIncluidos: ['inventario', 'operaciones', 'despachos', 'compras', 'transporte', 'reportes', 'panel-auditoria'],
    esPublico: true,
  },
  {
    id: 'empresarial',
    nombre: 'Empresarial',
    precioMensual: 249,
    precioAnual: 2390,
    caracteristicas: ['Todo ilimitado', 'Multi-empresa', 'Soporte 24/7', 'API completa'],
    maxUsuarios: -1,
    maxProductos: -1,
    maxAlmacenes: -1,
    maxProveedores: -1,
    maxClientes: -1,
    maxOrdenesMes: -1,
    almacenamientoGB: 100,
    soporte: '24/7',
    apiAccess: true,
    multiEmpresa: true,
    exportAvanzada: true,
    reportesAvanzados: true,
    modulosIncluidos: [
      'inventario', 'operaciones', 'compras', 'despachos', 'transporte',
      'ventas', 'contable', 'portal-b2b', 'reportes', 'panel-auditoria',
    ],
    esPublico: true,
  },
];

// Landing Page pública (AdminSaaS → "Landing Page") — copy orientado a venta
// (beneficios cuantificados, no lista de funcionalidades). Mismo vocabulario
// de campos que TabLanding.jsx / LandingPage/constants.js (LANDING_DEFAULT).
// Solo se aplica si el registro está vacío ({}) — ver nota en el seed: no
// pisa ediciones que el SuperAdmin ya haya guardado desde el panel.
const LANDING_SEED = {
  sitio: {
    nombre: 'StockPro',
    tagline: 'La plataforma logística diseñada para empresas que necesitan control total.',
    descripcion: 'Sistema SaaS de gestión de inventario, despachos y operaciones logísticas para empresas modernas. Centraliza almacenes, pedidos, distribución y trazabilidad en una sola plataforma.',
    colorPrimario: '#00c896',
    logoUrl: '',
  },
  hero: {
    titulo: 'Digitaliza toda tu operación logística desde una sola plataforma',
    subtitulo: 'Centraliza inventarios, pedidos, almacenes, distribución y trazabilidad. Reduce errores operativos, automatiza procesos y toma decisiones en tiempo real.',
    ctaTexto: 'Solicitar Demo Gratis',
    ctaUrl: '#planes',
    ctaTexto2: 'Ver Planes',
    ctaUrl2: '#planes',
    imagenUrl: '',
  },
  caracteristicas: [
    { id: 'cf_1', icono: '📦', titulo: 'Reduce Errores de Inventario hasta 85%', descripcion: 'Control total de stock con trazabilidad completa, alertas automáticas y kardex valorizado. Elimina las discrepancias entre sistema y almacén.' },
    { id: 'cf_2', icono: '🚚', titulo: 'Acelera tus Despachos hasta un 40%', descripcion: 'Planifica rutas, controla tu flota y rastrea cada entrega en tiempo real. Más OTIF, menos reclamos, clientes más satisfechos.' },
    { id: 'cf_3', icono: '📊', titulo: 'Visibilidad Total en Tiempo Real', descripcion: 'Dashboards ejecutivos con KPIs logísticos: OTIF, Fill Rate, Perfect Order. Decisiones basadas en datos, no en suposiciones.' },
    { id: 'cf_4', icono: '🌐', titulo: 'Portal B2B de Clientes y Pedidos', descripcion: 'Tus clientes hacen pedidos directamente desde un portal personalizado. Sin llamadas, sin errores y con trazabilidad en tiempo real desde el momento en que el pedido entra al sistema.' },
    { id: 'cf_5', icono: '👥', titulo: 'Equipo Sincronizado, Sin Silos', descripcion: 'Multi-usuario con roles y permisos granulares por módulo. Todo tu equipo trabajando sobre la misma fuente de verdad.' },
    { id: 'cf_6', icono: '☁️', titulo: 'Escala sin Límites, 99.9% Uptime', descripcion: 'Plataforma cloud con SLA garantizado. Sin instalaciones ni actualizaciones manuales. Crece sin perder el control.' },
    { id: 'cf_7', icono: '🔮', titulo: 'Previsión de Demanda Inteligente', descripcion: 'Anticipa la demanda con análisis histórico de movimientos. Reabastécete antes de que el stock se agote y reduce el capital inmovilizado en inventario parado.' },
  ],
  contacto: { email: 'ventas@stockpro.com', telefono: '+51 1 234 5678', whatsapp: '+51 999 000 111', direccion: 'Lima, Perú' },
  redesSociales: { linkedin: '', twitter: '', facebook: '', instagram: '', youtube: '' },
  seo: {
    titulo: 'StockPro — Software Logístico SaaS | Inventario, Almacenes y Despachos',
    descripcion: 'Digitaliza tu operación logística con StockPro. Software ERP logístico para gestión de inventario, almacenes, pedidos y trazabilidad en tiempo real. Prueba 30 días gratis sin tarjeta.',
    keywords: 'software logístico, sistema logístico, gestión de inventario, control de almacenes, trazabilidad logística, ERP logístico, software distribución, logística empresarial, plataforma logística, saas logística peru',
  },
  footer: { textoLegal: '© 2026 StockPro. Todos los derechos reservados.', mostrarPrecios: true, moneda: 'PEN', probarGratisDias: 30 },
};

async function main() {
  console.log('🌱 Seed StockPro API (Fase 1 + Fase 7d)');

  // 1) Roles base (catálogo global, empresaId = null)
  //
  // Nota técnica: NO se puede usar upsert() con el selector compuesto
  // empresaId_codigo cuando empresaId es null — Prisma rechaza valores
  // null dentro de un identificador de unique compuesto en tiempo de
  // ejecución ("Argument `empresaId` must not be null"), aunque el campo
  // sea nullable en el schema. Por eso se resuelve con findFirst + create/update.
  for (const r of ROLES_BASE) {
    const existente = await prisma.rol.findFirst({
      where: { empresaId: null, codigo: r.codigo },
    });

    if (existente) {
      await prisma.permiso.deleteMany({ where: { rolId: existente.id } });
      await prisma.rol.update({
        where: { id: existente.id },
        data: {
          label: r.label,
          permisos: { create: r.permisos.map((modulo) => ({ modulo })) },
        },
      });
    } else {
      await prisma.rol.create({
        data: {
          codigo: r.codigo,
          label: r.label,
          empresaId: null,
          esPersonalizado: false,
          permisos: { create: r.permisos.map((modulo) => ({ modulo })) },
        },
      });
    }

    console.log(`  ✓ Rol base: ${r.label} (${r.codigo})`);
  }

  // 2) PlatformAdmin (Fase 7d) — login separado en /api/admin/auth/login.
  // OBLIGATORIO por env: no hay credencial hardcodeada de respaldo. Sin estas
  // variables el seed falla en vez de crear un SuperAdmin con contraseña
  // conocida (hallazgo de seguridad 2026-09-10). Los SuperAdmin adicionales
  // (máx. 2) se crean después desde el panel y viven en la base.
  const platformAdminEmail = process.env.PLATFORM_ADMIN_EMAIL?.trim();
  const platformAdminPassword = process.env.PLATFORM_ADMIN_PASSWORD?.trim();
  if (!platformAdminEmail || !platformAdminPassword) {
    throw new Error(
      'PLATFORM_ADMIN_EMAIL y PLATFORM_ADMIN_PASSWORD son obligatorias para el seed. ' +
        'Configúralas en .env (ver .env.example).',
    );
  }
  const platformAdminNombre = process.env.PLATFORM_ADMIN_NOMBRE?.trim() || 'Super Admin';
  const adminPasswordHash = await bcrypt.hash(platformAdminPassword, 12);
  const platformAdmin = await prisma.platformAdmin.upsert({
    where: { email: platformAdminEmail },
    // Sincroniza la contraseña en cada corrida: sin esto, cambiar
    // PLATFORM_ADMIN_PASSWORD y re-seedear no tenía efecto si la fila ya existía.
    // esNativo=true: es la cuenta raíz de la plataforma (regla de gobierno 2).
    update: { passwordHash: adminPasswordHash, nombre: platformAdminNombre, activo: true, esNativo: true },
    create: {
      email: platformAdminEmail,
      nombre: platformAdminNombre,
      passwordHash: adminPasswordHash,
      esNativo: true,
    },
  });
  console.log(`  ✓ PlatformAdmin: ${platformAdmin.email}`);

  // 3) Catálogo base de PlanSaaS (Fase 7d)
  for (const p of PLANES_BASE) {
    let plan = await prisma.planSaaS.upsert({
      where: { id: p.id },
      update: {},
      create: p,
    });

    // Backfill por unión: el upsert de arriba no toca planes ya existentes
    // (update: {}), así que un plan sembrado antes de agregar un módulo nuevo
    // a PLANES_BASE (ej. 'panel-auditoria' para el rol Auditor) nunca lo
    // recibiría solo. Se agrega lo que falte sin pisar nada — si un admin
    // sumó módulos a mano desde AdminSaaS, esos se mantienen intactos.
    const faltantes = p.modulosIncluidos.filter((m) => !plan.modulosIncluidos.includes(m));
    if (faltantes.length > 0) {
      plan = await prisma.planSaaS.update({
        where: { id: p.id },
        data: { modulosIncluidos: [...plan.modulosIncluidos, ...faltantes] },
      });
    }

    console.log(`  ✓ Plan: ${plan.nombre} (${plan.id}) — módulos: ${plan.modulosIncluidos.join(', ')}`);
  }

  // 4) Configuración de plataforma (singleton) — el switch de tarjetas de acceso
  // rápido del Login. Se crea si no existe: ON solo si esta es una instancia de
  // demo/desarrollo (SEED_DEMO_TENANTS=true), OFF en una producción real. Si ya
  // existe, se respeta lo que el SuperAdmin haya dejado configurado.
  const esInstanciaDemo = process.env.SEED_DEMO_TENANTS === 'true';
  const plataformaConfigExistente = await prisma.plataformaConfig.findFirst();
  if (!plataformaConfigExistente) {
    await prisma.plataformaConfig.create({ data: { accesoRapidoTarjetas: esInstanciaDemo } });
    console.log(`  ✓ PlataformaConfig: accesoRapidoTarjetas=${esInstanciaDemo}`);
  } else {
    console.log('  · PlataformaConfig: ya existe, no se sobrescribe');
  }

  // 5) Landing Page — singleton (empresaId no aplica, no tiene RLS, ver Fase 7d).
  // Solo se aplica si al registro le falta contenido real (tagline, subtítulo
  // del hero o al menos una característica) — así no pisa una configuración
  // que el SuperAdmin ya haya completado a mano desde el panel en una corrida
  // posterior del seed, pero sí corrige el registro mínimo/de prueba que
  // quedó de Fase 7d (solo `hero.titulo` + `sitio.nombre`).

  const landingExistente = await prisma.landingConfig.findFirst();
  const landingData = landingExistente?.data as Record<string, any> | undefined;
  const landingIncompleta =
    !landingExistente ||
    !landingData ||
    !landingData.sitio?.tagline ||
    !landingData.hero?.subtitulo ||
    !Array.isArray(landingData.caracteristicas) ||
    landingData.caracteristicas.length === 0;
  if (landingIncompleta) {
    if (landingExistente) {
      await prisma.landingConfig.update({ where: { id: landingExistente.id }, data: { data: LANDING_SEED } });
    } else {
      await prisma.landingConfig.create({ data: { data: LANDING_SEED } });
    }
    console.log('  ✓ Landing Page: configuración sembrada con copy orientado a venta');
  } else {
    console.log('  · Landing Page: ya tiene configuración propia, no se sobrescribe');
  }

  console.log('✅ Seed completo.');
}

main()
  .catch((e) => {
    console.error('❌ Error en el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
