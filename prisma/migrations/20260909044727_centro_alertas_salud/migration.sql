-- AlterTable
ALTER TABLE "reglas_alerta_vencimiento" ADD COLUMN     "eliminada" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "alertas_estado" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "nota" TEXT,
    "silenciadaHasta" TIMESTAMP(3),
    "actualizadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alertas_estado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alertas_estado_clave_key" ON "alertas_estado"("clave");
