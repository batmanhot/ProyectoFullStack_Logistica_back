-- ═══════════════════════════════════════════════════════════════════
-- StockPro API — Row-Level Security · Fase 10 (Gestión Comercial)
-- Tabla: oportunidades (empresaId directo) + su tabla hija sin
-- empresaId propio (actividades_comerciales, vía oportunidadId).
-- ═══════════════════════════════════════════════════════════════════

-- OPORTUNIDADES -----------------------------------------------------------
ALTER TABLE oportunidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON oportunidades
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- ACTIVIDADES_COMERCIALES — vía oportunidadId -> oportunidades.empresaId --
ALTER TABLE actividades_comerciales ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON actividades_comerciales
  USING (
    EXISTS (
      SELECT 1 FROM oportunidades o
      WHERE o.id = actividades_comerciales."oportunidadId"
        AND o."empresaId" = current_setting('app.current_tenant', true)
    )
  );
