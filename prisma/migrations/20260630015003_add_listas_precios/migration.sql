-- CreateTable
CREATE TABLE "listas_precios" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'general',
    "descuento" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "markup" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "precios" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listas_precios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listas_precios_empresaId_idx" ON "listas_precios"("empresaId");

-- AddForeignKey
ALTER TABLE "listas_precios" ADD CONSTRAINT "listas_precios_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
