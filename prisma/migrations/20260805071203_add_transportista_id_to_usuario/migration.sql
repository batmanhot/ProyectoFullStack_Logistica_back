-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "transportistaId" TEXT;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_transportistaId_fkey" FOREIGN KEY ("transportistaId") REFERENCES "transportistas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
