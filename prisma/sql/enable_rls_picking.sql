-- ═══════════════════════════════════════════════════════════════════
-- StockPro API — Row-Level Security · Módulo de Picking (2026-07-31)
-- Tablas: listas_picking (empresaId directo), lineas_picking (vía listaId)
-- ═══════════════════════════════════════════════════════════════════

-- LISTAS_PICKING -------------------------------------------------------
ALTER TABLE listas_picking ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON listas_picking
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- LINEAS_PICKING — vía listaId -------------------------------------------
ALTER TABLE lineas_picking ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON lineas_picking
  USING (
    EXISTS (
      SELECT 1 FROM listas_picking lp
      WHERE lp.id = lineas_picking."listaId"
        AND lp."empresaId" = current_setting('app.current_tenant', true)
    )
  );
