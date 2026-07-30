-- ═══════════════════════════════════════════════════════════════════
-- StockPro API — Row-Level Security · Fase 7a (Flota)
-- Tabla: vehiculos_flota (empresaId directo)
-- + mantenimientos_vehiculo, registros_combustible (vía vehiculoId).
-- ═══════════════════════════════════════════════════════════════════

-- VEHICULOS_FLOTA -----------------------------------------------------
ALTER TABLE vehiculos_flota ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON vehiculos_flota
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- MANTENIMIENTOS_VEHICULO — vía vehiculoId -------------------------------
ALTER TABLE mantenimientos_vehiculo ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON mantenimientos_vehiculo
  USING (
    EXISTS (
      SELECT 1 FROM vehiculos_flota v
      WHERE v.id = mantenimientos_vehiculo."vehiculoId"
        AND v."empresaId" = current_setting('app.current_tenant', true)
    )
  );

-- REGISTROS_COMBUSTIBLE — vía vehiculoId -----------------------------------
ALTER TABLE registros_combustible ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON registros_combustible
  USING (
    EXISTS (
      SELECT 1 FROM vehiculos_flota v
      WHERE v.id = registros_combustible."vehiculoId"
        AND v."empresaId" = current_setting('app.current_tenant', true)
    )
  );
