-- ═══════════════════════════════════════════════════════════════════
-- StockPro API — Row-Level Security · Fase 7c (Empaque)
-- Tabla: empaques (sin empresaId propio — vía despachoId -> Despacho.empresaId)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE empaques ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON empaques
  USING (
    EXISTS (
      SELECT 1 FROM despachos d
      WHERE d.id = empaques."despachoId"
        AND d."empresaId" = current_setting('app.current_tenant', true)
    )
  );
