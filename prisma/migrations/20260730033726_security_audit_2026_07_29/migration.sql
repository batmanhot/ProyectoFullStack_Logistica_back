-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "portalTokenVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "proveedores" ADD COLUMN     "portalTokenVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;
