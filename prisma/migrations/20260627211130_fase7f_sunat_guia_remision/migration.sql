-- CreateEnum
CREATE TYPE "EstadoDocumentoSunat" AS ENUM ('PENDIENTE', 'ENVIADO', 'ACEPTADO', 'RECHAZADO');

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "direccion" TEXT;

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "codigoSunat" TEXT;

-- AlterTable
ALTER TABLE "transportistas" ADD COLUMN     "ruc" TEXT;

-- CreateTable
CREATE TABLE "guias_remision_electronicas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "despachoId" TEXT NOT NULL,
    "estado" "EstadoDocumentoSunat" NOT NULL DEFAULT 'PENDIENTE',
    "fechaEnvio" TIMESTAMP(3),
    "fechaRespuesta" TIMESTAMP(3),
    "cdr" TEXT,
    "motivoRechazo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guias_remision_electronicas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guias_remision_electronicas_despachoId_key" ON "guias_remision_electronicas"("despachoId");

-- CreateIndex
CREATE INDEX "guias_remision_electronicas_empresaId_idx" ON "guias_remision_electronicas"("empresaId");

-- AddForeignKey
ALTER TABLE "guias_remision_electronicas" ADD CONSTRAINT "guias_remision_electronicas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guias_remision_electronicas" ADD CONSTRAINT "guias_remision_electronicas_despachoId_fkey" FOREIGN KEY ("despachoId") REFERENCES "despachos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
