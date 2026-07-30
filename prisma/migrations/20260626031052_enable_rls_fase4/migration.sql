-- ═══════════════════════════════════════════════════════════════════
-- StockPro API — Row-Level Security · Fase 4
-- Tablas: clientes, ordenes_compra, cotizaciones, proformas,
-- cuentas_por_cobrar (empresaId directo) + sus tablas hijas sin
-- empresaId propio (orden_compra_items, cotizacion_items,
-- respuestas_proveedor, respuesta_items, proforma_items, pagos_cxc).
-- ═══════════════════════════════════════════════════════════════════

-- CLIENTES ------------------------------------------------------------
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clientes
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- ORDENES_COMPRA -------------------------------------------------------
ALTER TABLE ordenes_compra ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ordenes_compra
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- ORDEN_COMPRA_ITEMS — vía ordenCompraId -> ordenes_compra.empresaId ------
ALTER TABLE orden_compra_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orden_compra_items
  USING (
    EXISTS (
      SELECT 1 FROM ordenes_compra oc
      WHERE oc.id = orden_compra_items."ordenCompraId"
        AND oc."empresaId" = current_setting('app.current_tenant', true)
    )
  );

-- COTIZACIONES ----------------------------------------------------------
ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON cotizaciones
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- COTIZACION_ITEMS — vía cotizacionId ------------------------------------
ALTER TABLE cotizacion_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON cotizacion_items
  USING (
    EXISTS (
      SELECT 1 FROM cotizaciones c
      WHERE c.id = cotizacion_items."cotizacionId"
        AND c."empresaId" = current_setting('app.current_tenant', true)
    )
  );

-- RESPUESTAS_PROVEEDOR — vía cotizacionId --------------------------------
ALTER TABLE respuestas_proveedor ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON respuestas_proveedor
  USING (
    EXISTS (
      SELECT 1 FROM cotizaciones c
      WHERE c.id = respuestas_proveedor."cotizacionId"
        AND c."empresaId" = current_setting('app.current_tenant', true)
    )
  );

-- RESPUESTA_ITEMS — vía respuestaId -> respuestas_proveedor -> cotizacionId
ALTER TABLE respuesta_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON respuesta_items
  USING (
    EXISTS (
      SELECT 1 FROM respuestas_proveedor rp
      JOIN cotizaciones c ON c.id = rp."cotizacionId"
      WHERE rp.id = respuesta_items."respuestaId"
        AND c."empresaId" = current_setting('app.current_tenant', true)
    )
  );

-- PROFORMAS ---------------------------------------------------------------
ALTER TABLE proformas ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON proformas
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- PROFORMA_ITEMS — vía proformaId ----------------------------------------
ALTER TABLE proforma_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON proforma_items
  USING (
    EXISTS (
      SELECT 1 FROM proformas p
      WHERE p.id = proforma_items."proformaId"
        AND p."empresaId" = current_setting('app.current_tenant', true)
    )
  );

-- CUENTAS_POR_COBRAR ------------------------------------------------------
ALTER TABLE cuentas_por_cobrar ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON cuentas_por_cobrar
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- PAGOS_CXC — vía cuentaId -------------------------------------------------
ALTER TABLE pagos_cxc ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pagos_cxc
  USING (
    EXISTS (
      SELECT 1 FROM cuentas_por_cobrar cxc
      WHERE cxc.id = pagos_cxc."cuentaId"
        AND cxc."empresaId" = current_setting('app.current_tenant', true)
    )
  );
