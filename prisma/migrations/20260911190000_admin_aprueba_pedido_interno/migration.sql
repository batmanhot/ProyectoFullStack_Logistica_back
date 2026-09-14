-- ═══════════════════════════════════════════════════════════════════
-- Alcance de roles (2026-09-11) — Admin deja de tener el comodín '*' y pasa
-- a ser "Supervisor Operativo de la capa de Operaciones", con un catálogo de
-- permisos curado (ver prisma/seed.ts). Sin este backfill, Admin quedaría
-- con 403 aprobando Pedidos Internos en TODO negocio ya existente: la regla
-- 'PEDIDO_INTERNO' de cada tenant fue sembrada por la migración
-- 20260910161424_reglas_aprobacion con rolesAprobadores =
-- ['supervisor','gerente-operaciones'] — 'admin' nunca figuró ahí porque
-- hasta hoy no hacía falta (el comodín '*' lo saltaba todo).
--
-- Agrega 'admin' a cualquier regla de aprobación EXISTENTE que ya tenga una
-- lista no vacía y todavía no lo incluya — no solo PEDIDO_INTERNO (por si
-- algún tenant ya personalizó otra regla vía Configuración → Aprobaciones,
-- restringiéndola sin saber que algún día Admin dejaría de tener '*').
-- Reglas con lista vacía ([]) no se tocan: ahí "vacío" ya significa "basta
-- el permiso de módulo", y Admin entra solo con el nuevo permiso angosto
-- 'despachos-aprobar'/'pedidos-internos-aprobar' (ver seed.ts).
-- ═══════════════════════════════════════════════════════════════════
UPDATE "reglas_aprobacion"
SET "rolesAprobadores" = array_append("rolesAprobadores", 'admin')
WHERE array_length("rolesAprobadores", 1) > 0
  AND NOT ('admin' = ANY("rolesAprobadores"));
