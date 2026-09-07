-- AlterTable
ALTER TABLE "movimientos" ADD COLUMN     "pedidoInternoId" TEXT;

-- AddForeignKey
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_pedidoInternoId_fkey" FOREIGN KEY ("pedidoInternoId") REFERENCES "pedidos_internos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
