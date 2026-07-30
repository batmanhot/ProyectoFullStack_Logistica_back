-- CreateEnum
CREATE TYPE "EstadoOrdenCompra" AS ENUM ('PENDIENTE', 'APROBADA', 'PARCIAL', 'RECIBIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoCotizacion" AS ENUM ('BORRADOR', 'ENVIADA', 'RESPONDIDA', 'ADJUDICADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoProforma" AS ENUM ('BORRADOR', 'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'VENCIDA');

-- CreateEnum
CREATE TYPE "EstadoCxC" AS ENUM ('PENDIENTE', 'PARCIAL', 'COBRADA', 'VENCIDA');

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "ruc" TEXT,
    "contacto" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordenes_compra" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "almacenId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEntrega" TIMESTAMP(3),
    "estado" "EstadoOrdenCompra" NOT NULL DEFAULT 'PENDIENTE',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "igv" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ordenes_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orden_compra_items" (
    "id" TEXT NOT NULL,
    "ordenCompraId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "costoUnitario" DECIMAL(12,2) NOT NULL,
    "cantidadRecibida" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "orden_compra_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizaciones" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaVencimiento" TIMESTAMP(3),
    "estado" "EstadoCotizacion" NOT NULL DEFAULT 'BORRADOR',
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizacion_items" (
    "id" TEXT NOT NULL,
    "cotizacionId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "descripcion" TEXT,
    "cantidad" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "cotizacion_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "respuestas_proveedor" (
    "id" TEXT NOT NULL,
    "cotizacionId" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" DECIMAL(12,2) NOT NULL,
    "tiempoEntrega" INTEGER,
    "notas" TEXT,
    "ganadora" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "respuestas_proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "respuesta_items" (
    "id" TEXT NOT NULL,
    "respuestaId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "precioUnitario" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "respuesta_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proformas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaVencimiento" TIMESTAMP(3),
    "estado" "EstadoProforma" NOT NULL DEFAULT 'BORRADOR',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "igv" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proformas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proforma_items" (
    "id" TEXT NOT NULL,
    "proformaId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "descripcion" TEXT,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "precioUnitario" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "proforma_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuentas_por_cobrar" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "despachoId" TEXT,
    "monto" DECIMAL(12,2) NOT NULL,
    "saldo" DECIMAL(12,2) NOT NULL,
    "fechaEmision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "diasCredito" INTEGER NOT NULL,
    "estado" "EstadoCxC" NOT NULL DEFAULT 'PENDIENTE',
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuentas_por_cobrar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos_cxc" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "metodo" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notas" TEXT,

    CONSTRAINT "pagos_cxc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clientes_empresaId_idx" ON "clientes"("empresaId");

-- CreateIndex
CREATE INDEX "clientes_razonSocial_idx" ON "clientes" USING GIN ("razonSocial" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ordenes_compra_empresaId_idx" ON "ordenes_compra"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_compra_empresaId_numero_key" ON "ordenes_compra"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "cotizaciones_empresaId_idx" ON "cotizaciones"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "cotizaciones_empresaId_numero_key" ON "cotizaciones"("empresaId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "respuestas_proveedor_cotizacionId_proveedorId_key" ON "respuestas_proveedor"("cotizacionId", "proveedorId");

-- CreateIndex
CREATE INDEX "proformas_empresaId_idx" ON "proformas"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "proformas_empresaId_numero_key" ON "proformas"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "cuentas_por_cobrar_empresaId_idx" ON "cuentas_por_cobrar"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_por_cobrar_empresaId_numero_key" ON "cuentas_por_cobrar"("empresaId", "numero");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "almacenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_compra_items" ADD CONSTRAINT "orden_compra_items_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "ordenes_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_compra_items" ADD CONSTRAINT "orden_compra_items_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_items" ADD CONSTRAINT "cotizacion_items_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "cotizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_items" ADD CONSTRAINT "cotizacion_items_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respuestas_proveedor" ADD CONSTRAINT "respuestas_proveedor_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "cotizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respuestas_proveedor" ADD CONSTRAINT "respuestas_proveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respuesta_items" ADD CONSTRAINT "respuesta_items_respuestaId_fkey" FOREIGN KEY ("respuestaId") REFERENCES "respuestas_proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respuesta_items" ADD CONSTRAINT "respuesta_items_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_items" ADD CONSTRAINT "proforma_items_proformaId_fkey" FOREIGN KEY ("proformaId") REFERENCES "proformas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_items" ADD CONSTRAINT "proforma_items_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_por_cobrar" ADD CONSTRAINT "cuentas_por_cobrar_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_por_cobrar" ADD CONSTRAINT "cuentas_por_cobrar_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_cxc" ADD CONSTRAINT "pagos_cxc_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "cuentas_por_cobrar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
