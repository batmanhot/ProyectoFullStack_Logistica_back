-- ═══════════════════════════════════════════════════════════════════
-- StockPro API — Row-Level Security · Capas de Costo (2026-08-08)
-- Tablas: capas_costo (empresaId directo), capas_costo_consumos (vía capaCostoId)
-- ═══════════════════════════════════════════════════════════════════

-- CAPAS_COSTO ------------------------------------------------------------
ALTER TABLE capas_costo ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON capas_costo
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- CAPAS_COSTO_CONSUMOS — vía capaCostoId ----------------------------------
ALTER TABLE capas_costo_consumos ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON capas_costo_consumos
  USING (
    EXISTS (
      SELECT 1 FROM capas_costo cc
      WHERE cc.id = capas_costo_consumos."capaCostoId"
        AND cc."empresaId" = current_setting('app.current_tenant', true)
    )
  );
