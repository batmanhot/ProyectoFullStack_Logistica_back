-- ═══════════════════════════════════════════════════════════════════
-- StockPro API — Row-Level Security · Gestión de Pedidos por Proyecto (2026-09-04)
-- Tablas: cdrs, proyectos — ambas con empresaId directo.
-- ═══════════════════════════════════════════════════════════════════

-- CDRS ----------------------------------------------------------------------
ALTER TABLE cdrs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON cdrs
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- PROYECTOS -------------------------------------------------------------
ALTER TABLE proyectos ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON proyectos
  USING ("empresaId" = current_setting('app.current_tenant', true));
