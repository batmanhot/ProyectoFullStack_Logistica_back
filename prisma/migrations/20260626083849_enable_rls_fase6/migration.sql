-- ═══════════════════════════════════════════════════════════════════
-- StockPro API — Row-Level Security · Fase 6
-- Tablas: areas_internas, pedidos_internos, inventarios_fisicos
-- (empresaId directo) + pedido_interno_items (vía pedidoId),
-- inventario_fisico_lineas (vía inventarioId).
-- ═══════════════════════════════════════════════════════════════════

-- AREAS_INTERNAS --------------------------------------------------------
ALTER TABLE areas_internas ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON areas_internas
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- PEDIDOS_INTERNOS -------------------------------------------------------
ALTER TABLE pedidos_internos ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pedidos_internos
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- PEDIDO_INTERNO_ITEMS — vía pedidoId -------------------------------------
ALTER TABLE pedido_interno_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pedido_interno_items
  USING (
    EXISTS (
      SELECT 1 FROM pedidos_internos p
      WHERE p.id = pedido_interno_items."pedidoId"
        AND p."empresaId" = current_setting('app.current_tenant', true)
    )
  );

-- INVENTARIOS_FISICOS ------------------------------------------------------
ALTER TABLE inventarios_fisicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON inventarios_fisicos
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- INVENTARIO_FISICO_LINEAS — vía inventarioId -----------------------------
ALTER TABLE inventario_fisico_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON inventario_fisico_lineas
  USING (
    EXISTS (
      SELECT 1 FROM inventarios_fisicos inv
      WHERE inv.id = inventario_fisico_lineas."inventarioId"
        AND inv."empresaId" = current_setting('app.current_tenant', true)
    )
  );
