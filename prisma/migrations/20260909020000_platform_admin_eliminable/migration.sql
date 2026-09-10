-- El SuperAdmin nativo puede eliminar (hard delete) a otro administrador de
-- plataforma. Para no perder su rastro de auditoría, auditoria_plataforma.adminId
-- pasa a nullable con ON DELETE SET NULL (adminEmail ya está denormalizado).
ALTER TABLE "auditoria_plataforma" DROP CONSTRAINT "auditoria_plataforma_adminId_fkey";
ALTER TABLE "auditoria_plataforma" ALTER COLUMN "adminId" DROP NOT NULL;
ALTER TABLE "auditoria_plataforma"
  ADD CONSTRAINT "auditoria_plataforma_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "platform_admins"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
