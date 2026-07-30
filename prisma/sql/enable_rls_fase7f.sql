-- ═══════════════════════════════════════════════════════════════════
-- StockPro API — Row-Level Security · Fase 7f (Sunat / GRE)
-- Tabla: guias_remision_electronicas (empresaId directo)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE guias_remision_electronicas ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON guias_remision_electronicas
  USING ("empresaId" = current_setting('app.current_tenant', true));
