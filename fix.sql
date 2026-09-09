ALTER TABLE "empresas" ADD COLUMN IF NOT EXISTS "alertaVencimiento" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS "plataforma_config" (
  "id" TEXT NOT NULL,
  "accesoRapidoTarjetas" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "plataforma_config_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "empresas" DROP COLUMN IF EXISTS "modoDesarrollo";
GRANT SELECT, INSERT, UPDATE, DELETE ON "plataforma_config" TO stockpro_app;
