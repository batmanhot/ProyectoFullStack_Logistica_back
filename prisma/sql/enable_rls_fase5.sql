-- ═══════════════════════════════════════════════════════════════════
-- StockPro API — Row-Level Security · Fase 5
-- Tablas: transportistas, despachos, rutas (empresaId directo)
-- + despacho_items (vía despachoId), paradas (vía rutaId).
-- ═══════════════════════════════════════════════════════════════════

-- TRANSPORTISTAS ------------------------------------------------------------
ALTER TABLE transportistas ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON transportistas
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- DESPACHOS -------------------------------------------------------------
ALTER TABLE despachos ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON despachos
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- DESPACHO_ITEMS — vía despachoId -----------------------------------------
ALTER TABLE despacho_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON despacho_items
  USING (
    EXISTS (
      SELECT 1 FROM despachos d
      WHERE d.id = despacho_items."despachoId"
        AND d."empresaId" = current_setting('app.current_tenant', true)
    )
  );

-- RUTAS -------------------------------------------------------------------
ALTER TABLE rutas ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON rutas
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- PARADAS — vía rutaId ------------------------------------------------------
ALTER TABLE paradas ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON paradas
  USING (
    EXISTS (
      SELECT 1 FROM rutas r
      WHERE r.id = paradas."rutaId"
        AND r."empresaId" = current_setting('app.current_tenant', true)
    )
  );
