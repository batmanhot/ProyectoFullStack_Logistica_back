-- AlterTable
ALTER TABLE "planes_saas" ADD COLUMN     "esPublico" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "modulosIncluidos" TEXT[] DEFAULT ARRAY[]::TEXT[];
