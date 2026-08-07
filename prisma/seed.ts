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
import * as bcrypt from 'bcrypt';

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
    ], // sin 'ajustes' ni 'almacenes' — autoridad exclusiva del Supervisor de Almacén
  },
  {
    codigo: 'analista-compras',
    label: 'Analista de Compras',
    permisos: ['dashboard', 'alertas', 'ordenes', 'cotizaciones', 'proveedores', 'inventario', 'reportes', 'categorias'],
  },
  {
    codigo: 'ejecutivo-comercial',
    label: 'Ejecutivo Comercial',
    permisos: ['dashboard', 'alertas', 'clientes', 'proformas', 'cxc', 'portal-pedidos', 'lista-precios', 'reportes'],
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
  { codigo: 'solicitante', label: 'Solicitante', permisos: ['pedidos-internos'] },
  {
    codigo: 'auditor',
    label: 'Auditor',
    // Sin ningún módulo operativo — solo el panel de solo lectura (ver
    // panel-auditoria.controller.ts, que no expone ninguna ruta de escritura).
    permisos: ['dashboard', 'panel-auditoria'],
  },
];

// Un usuario por rol (menos 'owner', redundante con 'admin' — mismos permisos
// ['*']) para poder probar cada nivel de acceso desde las tarjetas de acceso
// rápido del Login en modo desarrollo (ver ROLES_LABEL en Login.jsx).
const EMPRESAS_DEMO = [
  {
    codigo: 'dlnorte',
    nombre: 'Distribuidora Lima Norte',
    ruc: '20100000001',
    email: 'contacto@dlnorte.demo',
    origen: 'demo',
    // empresarial: única forma de que los 12 roles sembrados (Fase 2 + Fase 3
    // vista móvil) se puedan probar todos sin que el plan bloquee alguno (Fase 3b).
    plan: 'empresarial',
    usuarios: [
      { email: 'admin@dlnorte.demo',       nombre: 'Admin DL Norte',       rolCodigo: 'admin' },
      { email: 'gerente@dlnorte.demo',     nombre: 'Gerente Operaciones DL Norte', rolCodigo: 'gerente-operaciones' },
      { email: 'supervisor@dlnorte.demo',  nombre: 'Supervisor DL Norte',  rolCodigo: 'supervisor' },
      { email: 'almacenero@dlnorte.demo',  nombre: 'Almacenero DL Norte',  rolCodigo: 'almacenero' },
      { email: 'compras@dlnorte.demo',     nombre: 'Analista Compras DL Norte', rolCodigo: 'analista-compras' },
      { email: 'comercial@dlnorte.demo',   nombre: 'Ejecutivo Comercial DL Norte', rolCodigo: 'ejecutivo-comercial' },
      { email: 'transporte@dlnorte.demo',  nombre: 'Coordinador Transporte DL Norte', rolCodigo: 'coordinador-transporte' },
      // Sin transportistaId acá — prisma:seed no crea Transportistas (eso lo hace
      // DatosService.sembrarDlNorte, disparado por "Restaurar Datos Demo"), que
      // además re-vincula este usuario a un transportista válido en cada reset.
      { email: 'chofer@dlnorte.demo',      nombre: 'Chofer DL Norte',      rolCodigo: 'chofer' },
      { email: 'contable@dlnorte.demo',    nombre: 'Contable DL Norte',    rolCodigo: 'contable-finanzas' },
      { email: 'auditor@dlnorte.demo',     nombre: 'Auditor DL Norte',     rolCodigo: 'auditor' },
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
      { email: 'admin@acme.demo',       nombre: 'Admin Acme',       rolCodigo: 'admin' },
      { email: 'gerente@acme.demo',     nombre: 'Gerente Operaciones Acme', rolCodigo: 'gerente-operaciones' },
      { email: 'supervisor@acme.demo',  nombre: 'Supervisor Acme',  rolCodigo: 'supervisor' },
      { email: 'almacenero@acme.demo',  nombre: 'Almacenero Acme',  rolCodigo: 'almacenero' },
      { email: 'compras@acme.demo',     nombre: 'Analista Compras Acme', rolCodigo: 'analista-compras' },
      { email: 'comercial@acme.demo',   nombre: 'Ejecutivo Comercial Acme', rolCodigo: 'ejecutivo-comercial' },
      { email: 'transporte@acme.demo',  nombre: 'Coordinador Transporte Acme', rolCodigo: 'coordinador-transporte' },
      { email: 'contable@acme.demo',    nombre: 'Contable Acme',    rolCodigo: 'contable-finanzas' },
      { email: 'auditor@acme.demo',     nombre: 'Auditor Acme',     rolCodigo: 'auditor' },
      { email: 'solicitante@acme.demo', nombre: 'Solicitante Acme', rolCodigo: 'solicitante' },
    ],
  },
];

// Password demo único para ambos admins — cámbialo apenas tengas datos reales.
const DEMO_PASSWORD = 'StockPro2026!';

// ── Fase 7d ──────────────────────────────────────────────────────
const PLATFORM_ADMIN_DEMO = {
  email: 'admin@stockpro.dev',
  nombre: 'Super Admin StockPro',
  password: 'AdminSaaS2026!',
};

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
  const rolesBaseCreados = new Map<string, string>(); // codigo -> id
  for (const r of ROLES_BASE) {
    const existente = await prisma.rol.findFirst({
      where: { empresaId: null, codigo: r.codigo },
    });

    let rol: { id: string };
    if (existente) {
      await prisma.permiso.deleteMany({ where: { rolId: existente.id } });
      rol = await prisma.rol.update({
        where: { id: existente.id },
        data: {
          label: r.label,
          permisos: { create: r.permisos.map((modulo) => ({ modulo })) },
        },
      });
    } else {
      rol = await prisma.rol.create({
        data: {
          codigo: r.codigo,
          label: r.label,
          empresaId: null,
          esPersonalizado: false,
          permisos: { create: r.permisos.map((modulo) => ({ modulo })) },
        },
      });
    }

    rolesBaseCreados.set(r.codigo, rol.id);
    console.log(`  ✓ Rol base: ${r.label} (${r.codigo})`);
  }

  // 2) Empresas demo + un usuario por rol
  // (Usuario.empresaId NO es nullable, así que el upsert compuesto sí es válido aquí.)
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  for (const e of EMPRESAS_DEMO) {
    let empresa = await prisma.empresa.upsert({
      where: { codigo: e.codigo },
      update: { modoDesarrollo: true },
      create: {
        codigo: e.codigo,
        nombre: e.nombre,
        ruc: e.ruc,
        email: e.email,
        origen: e.origen,
        plan: e.plan,
        modoDesarrollo: true, // permite las tarjetas de acceso rápido del Login mientras el proyecto está en desarrollo
      },
    });

    // Backfill de Fase 3b: el upsert de arriba no toca `plan` en `update`
    // (para no pisar un cambio hecho a mano desde AdminSaaS) — solo se
    // corrige si la empresa se quedó en el "starter" default que nunca se
    // reemplazó.
    if (empresa.plan === 'starter') {
      empresa = await prisma.empresa.update({ where: { id: empresa.id }, data: { plan: e.plan } });
    }

    console.log(`  ✓ Empresa: ${empresa.nombre} (${empresa.codigo}) — plan: ${empresa.plan}`);

    // El rol 'solicitante' necesita un área asignada para poder crear Pedidos
    // Internos (Usuario.areaId, ver schema.prisma) — se crea acá para que el
    // usuario demo funcione de una sola pieza, sin depender de "Restaurar
    // Datos Demo" (que solo corre por tenant, después del primer login).
    const areaOps = await prisma.areaInterna.upsert({
      where: { empresaId_codigo: { empresaId: empresa.id, codigo: 'OPS' } },
      update: {},
      create: { empresaId: empresa.id, nombre: 'Operaciones', codigo: 'OPS' },
    });

    for (const u of e.usuarios) {
      const rolId = rolesBaseCreados.get(u.rolCodigo)!;
      const usuario = await prisma.usuario.upsert({
        where: { empresaId_email: { empresaId: empresa.id, email: u.email } },
        update: { areaId: u.rolCodigo === 'solicitante' ? areaOps.id : undefined },
        create: {
          empresaId: empresa.id,
          nombre: u.nombre,
          email: u.email,
          passwordHash,
          rolId,
          areaId: u.rolCodigo === 'solicitante' ? areaOps.id : undefined,
        },
      });
      console.log(`  ✓ Usuario ${u.rolCodigo}: ${usuario.email} / password demo: ${DEMO_PASSWORD}`);
    }
  }

  // 3) PlatformAdmin (Fase 7d) — login separado en /api/admin/auth/login.
  // En producción, pasar PLATFORM_ADMIN_EMAIL/PLATFORM_ADMIN_PASSWORD como
  // variables de entorno (nunca hardcodear la credencial real acá ni en el
  // historial de git) — sin esas variables, cae al admin demo de siempre.
  const platformAdminEmail = process.env.PLATFORM_ADMIN_EMAIL || PLATFORM_ADMIN_DEMO.email;
  const platformAdminPassword = process.env.PLATFORM_ADMIN_PASSWORD || PLATFORM_ADMIN_DEMO.password;
  const adminPasswordHash = await bcrypt.hash(platformAdminPassword, 12);
  const platformAdmin = await prisma.platformAdmin.upsert({
    where: { email: platformAdminEmail },
    update: {},
    create: {
      email: platformAdminEmail,
      nombre: PLATFORM_ADMIN_DEMO.nombre,
      passwordHash: adminPasswordHash,
    },
  });
  console.log(`  ✓ PlatformAdmin: ${platformAdmin.email}`);

  // 4) Catálogo base de PlanSaaS (Fase 7d)
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
