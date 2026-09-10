-- docs/GOBIERNO-PLATAFORMA.md regla 2: la cuenta raíz nativa de la plataforma
-- (la que crea el seed) no se puede desactivar ni la puede editar otro SuperAdmin.
ALTER TABLE "platform_admins" ADD COLUMN "esNativo" BOOLEAN NOT NULL DEFAULT false;

-- Marca la cuenta más antigua como nativa (la que sembró el seed). Si la tabla
-- está vacía (base recién migrada, seed pendiente), no hace nada — el seed la marca.
DO $$
DECLARE nativo_id text;
BEGIN
  SELECT id INTO nativo_id FROM "platform_admins" ORDER BY "createdAt" ASC LIMIT 1;
  IF nativo_id IS NOT NULL THEN
    UPDATE "platform_admins" SET "esNativo" = true WHERE id = nativo_id;
  END IF;
END $$;
