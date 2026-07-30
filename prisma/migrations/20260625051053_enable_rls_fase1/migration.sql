-- ═══════════════════════════════════════════════════════════════════
-- StockPro API — Row-Level Security · Fase 1
-- Tablas con aislamiento por tenant: usuarios, roles, permisos.
--
-- NO se aplica a "empresas": esa tabla es el catálogo de tenants en sí
-- (el paso 1 del login, GET /api/empresas/:codigo, necesita leerla SIN
-- contexto de tenant todavía, antes de que exista un JWT).
--
-- "roles" es especial: empresaId es NULLABLE. Las filas con
-- empresaId = NULL son el catálogo BASE (owner/admin/supervisor/
-- almacenero/solicitante) y deben ser visibles para CUALQUIER tenant,
-- además de sus propios roles personalizados (roles_custom).
--
-- "permisos" no tiene columna empresaId propia (se relaciona solo por
-- rolId) — la política se resuelve con un EXISTS contra "roles".
--
-- Nota: el usuario de conexión que corre las migraciones/el seed es,
-- por defecto, OWNER de las tablas que crea — Postgres exime a los
-- owners de sus propias políticas RLS salvo que se use
-- "FORCE ROW LEVEL SECURITY" (no se activa aquí a propósito, para que
-- prisma/seed.ts pueda insertar sin necesidad de SET LOCAL).
-- ═══════════════════════════════════════════════════════════════════

-- USUARIOS ------------------------------------------------------------
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON usuarios
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- ROLES -----------------------------------------------------------------
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON roles
  USING (
    "empresaId" IS NULL                                       -- catálogo base, visible a todos
    OR "empresaId" = current_setting('app.current_tenant', true) -- roles personalizados del propio tenant
  );

-- PERMISOS ----------------------------------------------------------------
ALTER TABLE permisos ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON permisos
  USING (
    EXISTS (
      SELECT 1 FROM roles r
      WHERE r.id = permisos."rolId"
        AND (
          r."empresaId" IS NULL
          OR r."empresaId" = current_setting('app.current_tenant', true)
        )
    )
  );
