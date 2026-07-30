-- CreateEnum
CREATE TYPE "EstadoPedidoPortal" AS ENUM ('NUEVO', 'REVISANDO', 'APROBADO', 'RECHAZADO', 'CONVERTIDO');

-- CreateEnum
CREATE TYPE "EstadoFacturaB2B" AS ENUM ('ENVIADA', 'RECIBIDA', 'RECHAZADA');

-- CreateTable
CREATE TABLE "pedidos_portal" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "estado" "EstadoPedidoPortal" NOT NULL DEFAULT 'NUEVO',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "igv" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "observaciones" TEXT,
    "fechaEntregaDeseada" TIMESTAMP(3),
    "motivoRechazo" TEXT,
    "despachoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedidos_portal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_portal_items" (
    "id" TEXT NOT NULL,
    "pedidoPortalId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "precioUnitario" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "pedido_portal_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facturas_b2b" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ordenCompraId" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monto" DECIMAL(12,2),
    "notas" TEXT,
    "estado" "EstadoFacturaB2B" NOT NULL DEFAULT 'ENVIADA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facturas_b2b_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_portal_despachoId_key" ON "pedidos_portal"("despachoId");

-- CreateIndex
CREATE INDEX "pedidos_portal_empresaId_idx" ON "pedidos_portal"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_portal_empresaId_numero_key" ON "pedidos_portal"("empresaId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "facturas_b2b_ordenCompraId_key" ON "facturas_b2b"("ordenCompraId");

-- CreateIndex
CREATE INDEX "facturas_b2b_empresaId_idx" ON "facturas_b2b"("empresaId");

-- AddForeignKey
ALTER TABLE "pedidos_portal" ADD CONSTRAINT "pedidos_portal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_portal" ADD CONSTRAINT "pedidos_portal_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_portal" ADD CONSTRAINT "pedidos_portal_despachoId_fkey" FOREIGN KEY ("despachoId") REFERENCES "despachos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_portal_items" ADD CONSTRAINT "pedido_portal_items_pedidoPortalId_fkey" FOREIGN KEY ("pedidoPortalId") REFERENCES "pedidos_portal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_portal_items" ADD CONSTRAINT "pedido_portal_items_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas_b2b" ADD CONSTRAINT "facturas_b2b_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas_b2b" ADD CONSTRAINT "facturas_b2b_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "ordenes_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas_b2b" ADD CONSTRAINT "facturas_b2b_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
