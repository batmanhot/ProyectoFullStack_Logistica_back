/**
 * Mapea cada permiso granular de Rol.permisos a uno de los 9 grupos de
 * PlanSaaS.modulosIncluidos (Fase 1). Sin entrada = módulo de administración
 * interna (dashboard, alertas, usuarios, auditoria, cola-sync, configuracion)
 * — nunca gateado por plan, todo tenant lo tiene sin importar qué contrató.
 */
export const PERMISO_A_GRUPO_PLAN: Record<string, string | undefined> = {
  inventario: 'inventario',
  kardex: 'inventario',
  'inv-fisico': 'inventario',
  movimientos: 'inventario',
  vencimientos: 'inventario',
  reorden: 'inventario',
  prevision: 'inventario',
  'mapa-almacen': 'inventario',
  'lotes-series': 'inventario',

  entradas: 'operaciones',
  salidas: 'operaciones',
  ajustes: 'operaciones',
  devoluciones: 'operaciones',
  transferencias: 'operaciones',

  ordenes: 'compras',
  cotizaciones: 'compras',
  proveedores: 'compras',

  clientes: 'despachos',
  despachos: 'despachos',
  'pedidos-internos': 'despachos',
  'portal-pedidos': 'despachos',
  empaque: 'despachos',
  picking: 'despachos',

  transportes: 'transporte',
  flota: 'transporte',

  reportes: 'reportes',
  kpis: 'reportes',

  sunat: 'contable',
  financiero: 'contable',

  proformas: 'ventas',
  cxc: 'ventas',
  'lista-precios': 'ventas',

  // Add-on de solo lectura para el rol Auditor — grupo propio, no reutiliza
  // ninguno de los 9 grupos operativos. Disponible en profesional/empresarial
  // y en planes personalizados (a elección al crear el plan), no en trial/basico.
  'panel-auditoria': 'panel-auditoria',
};
