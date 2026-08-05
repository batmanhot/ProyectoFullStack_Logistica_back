-- CreateEnum
CREATE TYPE "EstadoLogisticoImportacion" AS ENUM ('EN_ORIGEN', 'EN_TRANSITO', 'EN_ADUANA', 'NACIONALIZADA');

-- CreateEnum
CREATE TYPE "TipoGastoImportacion" AS ENUM ('FLETE', 'SEGURO', 'ARANCEL', 'AGENTE_ADUANA', 'ALMACENAJE', 'OTRO');

-- AlterTable
ALTER TABLE "orden_compra_items" ADD COLUMN     "costoUnitarioReal" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "ordenes_compra" ADD COLUMN     "esImportacion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "estadoLogistico" "EstadoLogisticoImportacion",
ADD COLUMN     "incoterm" TEXT,
ADD COLUMN     "moneda" TEXT NOT NULL DEFAULT 'PEN',
ADD COLUMN     "numeroBL" TEXT,
ADD COLUMN     "numeroDUA" TEXT,
ADD COLUMN     "numeroFacturaComercial" TEXT,
ADD COLUMN     "tipoCambio" DECIMAL(10,4);

-- AlterTable
ALTER TABLE "proveedores" ADD COLUMN     "monedaNegociacion" TEXT NOT NULL DEFAULT 'PEN',
ADD COLUMN     "paisOrigen" TEXT;

-- CreateTable
CREATE TABLE "gastos_importacion" (
    "id" TEXT NOT NULL,
    "ordenCompraId" TEXT NOT NULL,
    "tipo" "TipoGastoImportacion" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gastos_importacion_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "gastos_importacion" ADD CONSTRAINT "gastos_importacion_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "ordenes_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
