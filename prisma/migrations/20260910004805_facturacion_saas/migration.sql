-- CreateEnum
CREATE TYPE "EstadoFacturaSaaS" AS ENUM ('EMITIDA', 'PAGADA', 'ANULADA');

-- CreateTable
CREATE TABLE "facturas_saas" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "renovacionId" TEXT,
    "planId" TEXT NOT NULL,
    "planNombre" TEXT NOT NULL,
    "ciclo" TEXT NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "subtotal" DECIMAL(10,2) NOT NULL,
    "igv" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "emitidaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "venceEn" TIMESTAMP(3) NOT NULL,
    "enviadaEn" TIMESTAMP(3),
    "estado" "EstadoFacturaSaaS" NOT NULL DEFAULT 'EMITIDA',
    "metodoPago" TEXT,
    "referenciaPago" TEXT,
    "pagadaEn" TIMESTAMP(3),
    "nota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facturas_saas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_factura_saas" (
    "id" TEXT NOT NULL,
    "facturaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_factura_saas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "facturas_saas_numero_key" ON "facturas_saas"("numero");

-- CreateIndex
CREATE INDEX "facturas_saas_empresaId_idx" ON "facturas_saas"("empresaId");

-- CreateIndex
CREATE INDEX "facturas_saas_estado_idx" ON "facturas_saas"("estado");

-- CreateIndex
CREATE INDEX "eventos_factura_saas_facturaId_idx" ON "eventos_factura_saas"("facturaId");

-- AddForeignKey
ALTER TABLE "facturas_saas" ADD CONSTRAINT "facturas_saas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas_saas" ADD CONSTRAINT "facturas_saas_renovacionId_fkey" FOREIGN KEY ("renovacionId") REFERENCES "renovaciones_plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas_saas" ADD CONSTRAINT "facturas_saas_planId_fkey" FOREIGN KEY ("planId") REFERENCES "planes_saas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_factura_saas" ADD CONSTRAINT "eventos_factura_saas_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "facturas_saas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
