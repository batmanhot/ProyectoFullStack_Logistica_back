-- Ubicación física del almacén — alimenta el Panorama de Almacenes
-- (supervisión multi-locación del Owner / Gerente de Operaciones).
-- Todo opcional: los almacenes existentes quedan sin ubicación hasta editarse.
ALTER TABLE "almacenes"
  ADD COLUMN "direccion"   TEXT,
  ADD COLUMN "ciudad"      TEXT,
  ADD COLUMN "region"      TEXT,
  ADD COLUMN "pais"        TEXT,
  ADD COLUMN "latitud"     DECIMAL(10,7),
  ADD COLUMN "longitud"    DECIMAL(10,7),
  ADD COLUMN "responsable" TEXT,
  ADD COLUMN "telefono"    TEXT;

-- Permiso nuevo 'panorama-almacenes' para el rol base Gerente de Operaciones
-- (Owner/Admin ya entran por el comodín '*'). Idempotente vía el índice único
-- (rolId, modulo). Si el rol base todavía no existe (seed pendiente en una
-- base recién migrada), no inserta nada — el seed lo creará ya con el permiso.
INSERT INTO "permisos" ("id", "rolId", "modulo")
SELECT
  md5(random()::text || clock_timestamp()::text || r."id"),
  r."id",
  'panorama-almacenes'
FROM "roles" r
WHERE r."codigo" = 'gerente-operaciones'
ON CONFLICT ("rolId", "modulo") DO NOTHING;
