-- CreateEnum
CREATE TYPE "EstadoDespacho" AS ENUM ('PEDIDO', 'APROBADO', 'PICKING', 'LISTO', 'DESPACHADO', 'ENTREGADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstadoRuta" AS ENUM ('PROGRAMADA', 'EN_RUTA', 'COMPLETADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoParada" AS ENUM ('PENDIENTE', 'EN_CAMINO', 'ENTREGADO', 'FALLIDO');

-- AlterTable
ALTER TABLE "inventario" ADD COLUMN     "cantidadReservada" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "transportistas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "placa" TEXT,
    "vehiculo" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "licencia" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transportistas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "despachos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "almacenId" TEXT NOT NULL,
    "estado" "EstadoDespacho" NOT NULL DEFAULT 'PEDIDO',
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEntrega" TIMESTAMP(3),
    "fechaDespacho" TIMESTAMP(3),
    "fechaEntregado" TIMESTAMP(3),
    "subtotal" DECIMAL(12,2) NOT NULL,
    "igv" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "guiaNumero" TEXT,
    "direccionEntrega" TEXT,
    "transportistaId" TEXT,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "despachos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "despacho_items" (
    "id" TEXT NOT NULL,
    "despachoId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "precioVenta" DECIMAL(12,2) NOT NULL,
    "costoUnitario" DECIMAL(12,2),
    "subtotal" DECIMAL(12,2) NOT NULL,
    "cantidadReservada" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "despacho_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rutas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "transportistaId" TEXT NOT NULL,
    "estado" "EstadoRuta" NOT NULL DEFAULT 'PROGRAMADA',
    "fechaSalida" TIMESTAMP(3) NOT NULL,
    "fechaRetorno" TIMESTAMP(3),
    "kmRecorrido" DECIMAL(10,2),
    "costoViaje" DECIMAL(12,2),
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rutas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paradas" (
    "id" TEXT NOT NULL,
    "rutaId" TEXT NOT NULL,
    "despachoId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "estado" "EstadoParada" NOT NULL DEFAULT 'PENDIENTE',
    "horaLlegada" TIMESTAMP(3),
    "horaPartida" TIMESTAMP(3),
    "observacion" TEXT,

    CONSTRAINT "paradas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transportistas_empresaId_idx" ON "transportistas"("empresaId");

-- CreateIndex
CREATE INDEX "despachos_empresaId_idx" ON "despachos"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "despachos_empresaId_numero_key" ON "despachos"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "rutas_empresaId_idx" ON "rutas"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "rutas_empresaId_numero_key" ON "rutas"("empresaId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "paradas_rutaId_despachoId_key" ON "paradas"("rutaId", "despachoId");

-- AddForeignKey
ALTER TABLE "cuentas_por_cobrar" ADD CONSTRAINT "cuentas_por_cobrar_despachoId_fkey" FOREIGN KEY ("despachoId") REFERENCES "despachos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transportistas" ADD CONSTRAINT "transportistas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despachos" ADD CONSTRAINT "despachos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despachos" ADD CONSTRAINT "despachos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despachos" ADD CONSTRAINT "despachos_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "almacenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despachos" ADD CONSTRAINT "despachos_transportistaId_fkey" FOREIGN KEY ("transportistaId") REFERENCES "transportistas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despacho_items" ADD CONSTRAINT "despacho_items_despachoId_fkey" FOREIGN KEY ("despachoId") REFERENCES "despachos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despacho_items" ADD CONSTRAINT "despacho_items_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rutas" ADD CONSTRAINT "rutas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rutas" ADD CONSTRAINT "rutas_transportistaId_fkey" FOREIGN KEY ("transportistaId") REFERENCES "transportistas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paradas" ADD CONSTRAINT "paradas_rutaId_fkey" FOREIGN KEY ("rutaId") REFERENCES "rutas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paradas" ADD CONSTRAINT "paradas_despachoId_fkey" FOREIGN KEY ("despachoId") REFERENCES "despachos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
