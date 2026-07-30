-- CreateEnum
CREATE TYPE "PrioridadPedido" AS ENUM ('NORMAL', 'URGENTE', 'CRITICO');

-- CreateEnum
CREATE TYPE "EstadoPedidoInterno" AS ENUM ('BORRADOR', 'ENVIADO', 'APROBADO', 'PICKING', 'ENTREGADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "EstadoInventarioFisico" AS ENUM ('EN_CURSO', 'CERRADO');

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "areaId" TEXT;

-- CreateTable
CREATE TABLE "areas_internas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "areas_internas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos_internos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "almacenId" TEXT NOT NULL,
    "estado" "EstadoPedidoInterno" NOT NULL DEFAULT 'BORRADOR',
    "prioridad" "PrioridadPedido" NOT NULL DEFAULT 'NORMAL',
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaRequerida" TIMESTAMP(3),
    "notasSolicitud" TEXT,
    "usuarioSolicitaId" TEXT NOT NULL,
    "fechaAprobacion" TIMESTAMP(3),
    "usuarioApruebaId" TEXT,
    "notasAprobacion" TEXT,
    "motivoRechazo" TEXT,
    "fechaEntrega" TIMESTAMP(3),
    "usuarioEntregaId" TEXT,
    "reciboConfirmado" BOOLEAN NOT NULL DEFAULT false,
    "fechaReciboConfirmado" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedidos_internos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_interno_items" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "unidadMedida" TEXT,
    "notas" TEXT,

    CONSTRAINT "pedido_interno_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventarios_fisicos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "almacenId" TEXT NOT NULL,
    "categoriaId" TEXT,
    "estado" "EstadoInventarioFisico" NOT NULL DEFAULT 'EN_CURSO',
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaCierre" TIMESTAMP(3),
    "usuarioId" TEXT NOT NULL,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventarios_fisicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventario_fisico_lineas" (
    "id" TEXT NOT NULL,
    "inventarioId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "stockSistema" DECIMAL(12,2) NOT NULL,
    "stockFisico" DECIMAL(12,2),
    "diferencia" DECIMAL(12,2),
    "costoUnitario" DECIMAL(12,2) NOT NULL,
    "ajustado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "inventario_fisico_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "areas_internas_empresaId_idx" ON "areas_internas"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "areas_internas_empresaId_codigo_key" ON "areas_internas"("empresaId", "codigo");

-- CreateIndex
CREATE INDEX "pedidos_internos_empresaId_idx" ON "pedidos_internos"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_internos_empresaId_numero_key" ON "pedidos_internos"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "inventarios_fisicos_empresaId_idx" ON "inventarios_fisicos"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "inventarios_fisicos_empresaId_numero_key" ON "inventarios_fisicos"("empresaId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "inventario_fisico_lineas_inventarioId_productoId_key" ON "inventario_fisico_lineas"("inventarioId", "productoId");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "areas_internas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "areas_internas" ADD CONSTRAINT "areas_internas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_internos" ADD CONSTRAINT "pedidos_internos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_internos" ADD CONSTRAINT "pedidos_internos_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "areas_internas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_internos" ADD CONSTRAINT "pedidos_internos_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "almacenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_internos" ADD CONSTRAINT "pedidos_internos_usuarioSolicitaId_fkey" FOREIGN KEY ("usuarioSolicitaId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_internos" ADD CONSTRAINT "pedidos_internos_usuarioApruebaId_fkey" FOREIGN KEY ("usuarioApruebaId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_internos" ADD CONSTRAINT "pedidos_internos_usuarioEntregaId_fkey" FOREIGN KEY ("usuarioEntregaId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_interno_items" ADD CONSTRAINT "pedido_interno_items_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos_internos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_interno_items" ADD CONSTRAINT "pedido_interno_items_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventarios_fisicos" ADD CONSTRAINT "inventarios_fisicos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventarios_fisicos" ADD CONSTRAINT "inventarios_fisicos_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "almacenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventarios_fisicos" ADD CONSTRAINT "inventarios_fisicos_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventarios_fisicos" ADD CONSTRAINT "inventarios_fisicos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_fisico_lineas" ADD CONSTRAINT "inventario_fisico_lineas_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "inventarios_fisicos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_fisico_lineas" ADD CONSTRAINT "inventario_fisico_lineas_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
