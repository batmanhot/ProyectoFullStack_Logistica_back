-- ═══════════════════════════════════════════════════════════════════
-- StockPro API — Row-Level Security · Fase 2 (Catálogos maestros)
-- Tablas: categorias, almacenes, proveedores (empresaId directo)
-- y ubicaciones (sin empresaId propio — se resuelve vía almacenId).
--
-- Mismo patrón ya validado en Fase 1 (enable_rls_fase1.sql):
-- el usuario que corre migraciones/seed es OWNER y por default
-- bypassa RLS, así que no se necesita FORCE ROW LEVEL SECURITY aquí.
-- ═══════════════════════════════════════════════════════════════════

-- CATEGORIAS ------------------------------------------------------------
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON categorias
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- ALMACENES ---------------------------------------------------------------
ALTER TABLE almacenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON almacenes
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- PROVEEDORES -------------------------------------------------------------
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON proveedores
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- UBICACIONES ------------------------------------------------------------
-- No tiene empresaId propio — se relaciona solo por almacenId. Mismo
-- patrón EXISTS que se usó para "permisos" en Fase 1 (vía roles).
ALTER TABLE ubicaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON ubicaciones
  USING (
    EXISTS (
      SELECT 1 FROM almacenes a
      WHERE a.id = ubicaciones."almacenId"
        AND a."empresaId" = current_setting('app.current_tenant', true)
    )
  );
