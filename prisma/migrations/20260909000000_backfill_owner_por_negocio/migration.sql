-- docs/GOBIERNO-PLATAFORMA.md regla 3: todo negocio debe tener al menos un
-- usuario Propietario (rol 'owner'). Los negocios creados antes de esta regla
-- solo tienen un 'admin'. Backfill: promover el 'admin' más antiguo de cada
-- negocio SIN owner a rol 'owner'.
--
-- - Se excluyen los negocios demo (origen='demo'): esos reciben su Propietario
--   del seed (owner@<tenant>.demo), no de este backfill.
-- - Si el rol base 'owner' todavía no existe (base recién migrada, seed
--   pendiente), el bloque no hace nada — el seed creará los usuarios ya con
--   el rol correcto.

DO $$
DECLARE
  owner_rol_id text;
BEGIN
  SELECT id INTO owner_rol_id FROM "roles" WHERE "empresaId" IS NULL AND codigo = 'owner';
  IF owner_rol_id IS NULL THEN
    RAISE NOTICE 'rol base "owner" inexistente (seed pendiente) — backfill de Propietarios omitido';
    RETURN;
  END IF;

  UPDATE "usuarios"
  SET "rolId" = owner_rol_id
  WHERE id IN (
    SELECT DISTINCT ON (u."empresaId") u.id
    FROM "usuarios" u
    JOIN "roles" r ON r.id = u."rolId"
    JOIN "empresas" e ON e.id = u."empresaId"
    WHERE r.codigo = 'admin'
      AND e.origen <> 'demo'
      AND NOT EXISTS (
        SELECT 1
        FROM "usuarios" uo
        JOIN "roles" ro ON ro.id = uo."rolId"
        WHERE uo."empresaId" = u."empresaId" AND ro.codigo = 'owner'
      )
    ORDER BY u."empresaId", u."createdAt" ASC
  );
END $$;
