-- ═══════════════════════════════════════════════════════════════════
-- StockPro API — Rol de aplicación sin privilegio de superusuario
-- (Hallazgo Crítico #1 de la auditoría de seguridad 2026-07-29)
--
-- Hasta ahora la app corría con DATABASE_URL apuntando al usuario
-- "postgres" (superusuario). Postgres exime a los superusuarios de
-- TODAS las políticas de Row-Level Security de forma incondicional —
-- ni siquiera FORCE ROW LEVEL SECURITY los alcanza. Resultado: las
-- políticas de las 10 migraciones enable_rls_faseN.sql eran, en la
-- práctica, código muerto.
--
-- Este script crea un rol de aplicación separado, SIN superusuario y
-- SIN ser dueño de ninguna tabla (las tablas las sigue creando/migrando
-- el usuario "postgres" vía `prisma migrate`). Al no ser ni superusuario
-- ni dueño, este rol queda sujeto a RLS automáticamente, sin necesitar
-- FORCE ROW LEVEL SECURITY.
--
-- La app en tiempo de ejecución debe conectarse con APP_DATABASE_URL
-- (ver .env / prisma.service.ts) usando este rol. `prisma migrate` y
-- `prisma:seed` siguen usando DATABASE_URL (el rol "postgres" original)
-- porque necesitan DDL y porque el seed de roles base/empresas demo no
-- pasa por SET LOCAL app.current_tenant.
--
-- Ejecutar con: npx ts-node prisma/create-app-role.ts
-- (variable de entorno STOCKPRO_APP_DB_PASSWORD requerida — ver script)
-- ═══════════════════════════════════════════════════════════════════

-- CREATE ROLE / ALTER ROLE se ejecuta desde create-app-role.ts (necesita
-- interpolar la contraseña, Postgres no admite bind params en DDL).

GRANT CONNECT ON DATABASE __DBNAME__ TO stockpro_app;
GRANT USAGE ON SCHEMA public TO stockpro_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO stockpro_app;

-- Para que las tablas que se creen en migraciones FUTURAS también
-- queden accesibles sin tener que volver a correr este script.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO stockpro_app;

-- Nunca DDL, nunca BYPASSRLS, nunca dueño de tablas — es intencional:
-- así es como Postgres aplica RLS automáticamente sobre este rol.
