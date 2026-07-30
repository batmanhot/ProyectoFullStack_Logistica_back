-- ═══════════════════════════════════════════════════════════════════
-- StockPro API — Row-Level Security · Fase 7e (Portal de Clientes +
-- Facturas B2B)
-- Tablas: pedidos_portal, facturas_b2b (empresaId directo)
-- + pedido_portal_items (vía pedidoPortalId).
-- ═══════════════════════════════════════════════════════════════════

-- PEDIDOS_PORTAL -----------------------------------------------------
ALTER TABLE pedidos_portal ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pedidos_portal
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- PEDIDO_PORTAL_ITEMS — vía pedidoPortalId --------------------------------
ALTER TABLE pedido_portal_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pedido_portal_items
  USING (
    EXISTS (
      SELECT 1 FROM pedidos_portal p
      WHERE p.id = pedido_portal_items."pedidoPortalId"
        AND p."empresaId" = current_setting('app.current_tenant', true)
    )
  );

-- FACTURAS_B2B ---------------------------------------------------------
ALTER TABLE facturas_b2b ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON facturas_b2b
  USING ("empresaId" = current_setting('app.current_tenant', true));
