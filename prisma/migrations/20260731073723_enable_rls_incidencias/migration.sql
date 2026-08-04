-- ═══════════════════════════════════════════════════════════════════
-- StockPro API — Row-Level Security · Registro de Incidencias (2026-07-31)
-- Tabla: registro_incidencias (empresaId directo)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE registro_incidencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON registro_incidencias
  USING ("empresaId" = current_setting('app.current_tenant', true));