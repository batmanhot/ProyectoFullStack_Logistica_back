-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "listaPrecioId" TEXT;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_listaPrecioId_fkey" FOREIGN KEY ("listaPrecioId") REFERENCES "listas_precios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
