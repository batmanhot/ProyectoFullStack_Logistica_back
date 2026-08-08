-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "costeoAutomatico" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "formulaValorizacion" TEXT NOT NULL DEFAULT 'PMP';

-- CreateTable
CREATE TABLE "capas_costo" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "loteId" TEXT,
    "movimientoEntradaId" TEXT NOT NULL,
    "cantidadOriginal" DECIMAL(12,2) NOT NULL,
    "cantidadDisponible" DECIMAL(12,2) NOT NULL,
    "costoUnitario" DECIMAL(12,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capas_costo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capas_costo_consumos" (
    "id" TEXT NOT NULL,
    "capaCostoId" TEXT NOT NULL,
    "movimientoSalidaId" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "costoUnitario" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capas_costo_consumos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "capas_costo_movimientoEntradaId_key" ON "capas_costo"("movimientoEntradaId");

-- CreateIndex
CREATE INDEX "capas_costo_empresaId_productoId_fecha_idx" ON "capas_costo"("empresaId", "productoId", "fecha");

-- AddForeignKey
ALTER TABLE "capas_costo" ADD CONSTRAINT "capas_costo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capas_costo" ADD CONSTRAINT "capas_costo_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capas_costo" ADD CONSTRAINT "capas_costo_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "lotes_producto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capas_costo" ADD CONSTRAINT "capas_costo_movimientoEntradaId_fkey" FOREIGN KEY ("movimientoEntradaId") REFERENCES "movimientos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capas_costo_consumos" ADD CONSTRAINT "capas_costo_consumos_capaCostoId_fkey" FOREIGN KEY ("capaCostoId") REFERENCES "capas_costo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capas_costo_consumos" ADD CONSTRAINT "capas_costo_consumos_movimientoSalidaId_fkey" FOREIGN KEY ("movimientoSalidaId") REFERENCES "movimientos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
