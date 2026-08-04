-- CreateEnum
CREATE TYPE "EstadoListaPicking" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'COMPLETADA');

-- CreateEnum
CREATE TYPE "EstadoLineaPicking" AS ENUM ('PENDIENTE', 'PARCIAL', 'COMPLETA');

-- CreateTable
CREATE TABLE "listas_picking" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "despachoId" TEXT NOT NULL,
    "estado" "EstadoListaPicking" NOT NULL DEFAULT 'PENDIENTE',
    "usuarioAsignadoId" TEXT,
    "fechaInicio" TIMESTAMP(3),
    "fechaFin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listas_picking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lineas_picking" (
    "id" TEXT NOT NULL,
    "listaId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "ubicacionId" TEXT,
    "cantidadRequerida" DECIMAL(12,2) NOT NULL,
    "cantidadPickeada" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "estado" "EstadoLineaPicking" NOT NULL DEFAULT 'PENDIENTE',

    CONSTRAINT "lineas_picking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "listas_picking_despachoId_key" ON "listas_picking"("despachoId");

-- CreateIndex
CREATE INDEX "listas_picking_empresaId_idx" ON "listas_picking"("empresaId");

-- AddForeignKey
ALTER TABLE "listas_picking" ADD CONSTRAINT "listas_picking_despachoId_fkey" FOREIGN KEY ("despachoId") REFERENCES "despachos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listas_picking" ADD CONSTRAINT "listas_picking_usuarioAsignadoId_fkey" FOREIGN KEY ("usuarioAsignadoId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_picking" ADD CONSTRAINT "lineas_picking_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "listas_picking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_picking" ADD CONSTRAINT "lineas_picking_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_picking" ADD CONSTRAINT "lineas_picking_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "ubicaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
