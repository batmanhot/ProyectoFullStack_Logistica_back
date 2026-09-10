-- Datos de perfil del usuario (sobre todo Owner / Admin del Negocio) — todos opcionales.
ALTER TABLE "usuarios" ADD COLUMN "telefono" TEXT;
ALTER TABLE "usuarios" ADD COLUMN "documento" TEXT;
ALTER TABLE "usuarios" ADD COLUMN "cargo" TEXT;
