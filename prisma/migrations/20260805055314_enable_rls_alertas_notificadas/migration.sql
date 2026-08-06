-- ═══════════════════════════════════════════════════════════════════
-- StockPro API — Row-Level Security · Alertas Notificadas (2026-08-05)
-- Tabla: alertas_notificadas (empresaId directo)
-- push_subscriptions NO lleva RLS — se accede por usuarioId (JWT) o vía
-- la relación con Usuario dentro de un withTenant ya scopeado.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE alertas_notificadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON alertas_notificadas
  USING ("empresaId" = current_setting('app.current_tenant', true));
