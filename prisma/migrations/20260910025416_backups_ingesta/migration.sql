-- DropForeignKey
ALTER TABLE "respaldos_negocio" DROP CONSTRAINT "respaldos_negocio_empresaId_fkey";

-- AlterTable
ALTER TABLE "respaldos_negocio" ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "formato" TEXT,
ADD COLUMN     "origen" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "storageKey" TEXT,
ALTER COLUMN "empresaId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "pruebas_restauracion" (
    "id" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "detalle" TEXT,
    "dumpProbado" TEXT,
    "duracionMs" INTEGER,
    "ejecutadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pruebas_restauracion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pruebas_restauracion_ejecutadaEn_idx" ON "pruebas_restauracion"("ejecutadaEn");

-- CreateIndex
CREATE INDEX "respaldos_negocio_origen_createdAt_idx" ON "respaldos_negocio"("origen", "createdAt");

-- AddForeignKey
ALTER TABLE "respaldos_negocio" ADD CONSTRAINT "respaldos_negocio_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
