-- AlterTable
ALTER TABLE "rutas" ADD COLUMN     "almacenId" TEXT;

-- AddForeignKey
ALTER TABLE "rutas" ADD CONSTRAINT "rutas_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "almacenes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
