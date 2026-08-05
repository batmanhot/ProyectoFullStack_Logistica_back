-- AlterTable
ALTER TABLE "proformas" ADD COLUMN     "listaPrecioId" TEXT;

-- AddForeignKey
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_listaPrecioId_fkey" FOREIGN KEY ("listaPrecioId") REFERENCES "listas_precios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
