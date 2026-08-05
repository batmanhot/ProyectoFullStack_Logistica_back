-- AlterEnum
ALTER TYPE "EstadoProforma" ADD VALUE 'CONVERTIDA';

-- CreateEnum
CREATE TYPE "FormaPago" AS ENUM ('CONTADO', 'CREDITO');

-- AlterTable
ALTER TABLE "proformas" ADD COLUMN     "despachoId" TEXT,
ADD COLUMN     "formaPago" "FormaPago" NOT NULL DEFAULT 'CREDITO';

-- AlterTable
ALTER TABLE "despachos" ADD COLUMN     "formaPago" "FormaPago" NOT NULL DEFAULT 'CREDITO';

-- CreateIndex
CREATE UNIQUE INDEX "proformas_despachoId_key" ON "proformas"("despachoId");

-- AddForeignKey
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_despachoId_fkey" FOREIGN KEY ("despachoId") REFERENCES "despachos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
