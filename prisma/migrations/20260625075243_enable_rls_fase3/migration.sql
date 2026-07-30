-- ═══════════════════════════════════════════════════════════════════
-- StockPro API — Row-Level Security · Fase 3 (Inventario core)
-- Tablas: productos, movimientos (empresaId directo)
-- y lotes_producto, inventario (sin empresaId propio — vía productoId).
-- ═══════════════════════════════════════════════════════════════════

-- PRODUCTOS ---------------------------------------------------------------
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON productos
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- MOVIMIENTOS ---------------------------------------------------------------
ALTER TABLE movimientos ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON movimientos
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- LOTES_PRODUCTO ------------------------------------------------------------
-- Sin empresaId propio — se relaciona solo por productoId. Mismo patrón
-- EXISTS usado para "ubicaciones" (Fase 2) y "permisos" (Fase 1).
ALTER TABLE lotes_producto ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON lotes_producto
  USING (
    EXISTS (
      SELECT 1 FROM productos p
      WHERE p.id = lotes_producto."productoId"
        AND p."empresaId" = current_setting('app.current_tenant', true)
    )
  );

-- INVENTARIO ------------------------------------------------------------
-- Tampoco tiene empresaId propio — mismo patrón vía productoId.
ALTER TABLE inventario ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON inventario
  USING (
    EXISTS (
      SELECT 1 FROM productos p
      WHERE p.id = inventario."productoId"
        AND p."empresaId" = current_setting('app.current_tenant', true)
    )
  );
