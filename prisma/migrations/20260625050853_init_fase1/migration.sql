-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('ENTRADA', 'SALIDA', 'AJUSTE', 'TRANSFERENCIA', 'DEVOLUCION');

-- CreateTable
CREATE TABLE "empresas" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ruc" TEXT NOT NULL,
    "contacto" TEXT,
    "email" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "estado" TEXT NOT NULL DEFAULT 'activo',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "origen" TEXT NOT NULL DEFAULT 'admin_saas',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rolId" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT,
    "codigo" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "esPersonalizado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permisos" (
    "id" TEXT NOT NULL,
    "rolId" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,

    CONSTRAINT "permisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "usuarioNombre" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "datos" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'Activo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "almacenes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "almacenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ubicaciones" (
    "id" TEXT NOT NULL,
    "almacenId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "zona" TEXT NOT NULL,
    "capacidadMax" INTEGER NOT NULL,
    "capacidadActual" INTEGER NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'Disponible',
    "observaciones" TEXT,

    CONSTRAINT "ubicaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "ruc" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "barcode" TEXT,
    "categoriaId" TEXT,
    "proveedorId" TEXT,
    "unidadMedida" TEXT,
    "esPerecedero" BOOLEAN NOT NULL DEFAULT false,
    "stockMinimo" DECIMAL(12,2),
    "stockMaximo" DECIMAL(12,2),
    "stockActual" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "precioCompra" DECIMAL(12,2),
    "precioVenta" DECIMAL(12,2),
    "estado" TEXT NOT NULL DEFAULT 'Activo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lotes_producto" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fechaVencimiento" TIMESTAMP(3),
    "cantidadOriginal" DECIMAL(12,2) NOT NULL,
    "cantidadActual" DECIMAL(12,2) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'Vigente',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lotes_producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventario" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "almacenId" TEXT NOT NULL,
    "ubicacionId" TEXT,
    "cantidad" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "productoId" TEXT NOT NULL,
    "loteId" TEXT,
    "almacenId" TEXT NOT NULL,
    "almacenDestinoId" TEXT,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "costoUnitario" DECIMAL(12,2),
    "motivo" TEXT,
    "documento" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresas_codigo_key" ON "empresas"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "empresas_ruc_key" ON "empresas"("ruc");

-- CreateIndex
CREATE INDEX "usuarios_empresaId_idx" ON "usuarios"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_empresaId_email_key" ON "usuarios"("empresaId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_empresaId_codigo_key" ON "roles"("empresaId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "permisos_rolId_modulo_key" ON "permisos"("rolId", "modulo");

-- CreateIndex
CREATE INDEX "auditoria_empresaId_modulo_idx" ON "auditoria"("empresaId", "modulo");

-- CreateIndex
CREATE INDEX "auditoria_empresaId_usuarioId_idx" ON "auditoria"("empresaId", "usuarioId");

-- CreateIndex
CREATE INDEX "auditoria_detalle_idx" ON "auditoria" USING GIN ("detalle" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "categorias_empresaId_idx" ON "categorias"("empresaId");

-- CreateIndex
CREATE INDEX "almacenes_empresaId_idx" ON "almacenes"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "ubicaciones_almacenId_codigo_key" ON "ubicaciones"("almacenId", "codigo");

-- CreateIndex
CREATE INDEX "proveedores_empresaId_idx" ON "proveedores"("empresaId");

-- CreateIndex
CREATE INDEX "proveedores_razonSocial_idx" ON "proveedores" USING GIN ("razonSocial" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "productos_empresaId_idx" ON "productos"("empresaId");

-- CreateIndex
CREATE INDEX "productos_nombre_idx" ON "productos" USING GIN ("nombre" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "productos_empresaId_sku_key" ON "productos"("empresaId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "lotes_producto_productoId_numero_key" ON "lotes_producto"("productoId", "numero");

-- CreateIndex
CREATE INDEX "inventario_almacenId_idx" ON "inventario"("almacenId");

-- CreateIndex
CREATE UNIQUE INDEX "inventario_productoId_almacenId_ubicacionId_key" ON "inventario"("productoId", "almacenId", "ubicacionId");

-- CreateIndex
CREATE INDEX "movimientos_empresaId_productoId_idx" ON "movimientos"("empresaId", "productoId");

-- CreateIndex
CREATE INDEX "movimientos_empresaId_tipo_fecha_idx" ON "movimientos"("empresaId", "tipo", "fecha");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permisos" ADD CONSTRAINT "permisos_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "almacenes" ADD CONSTRAINT "almacenes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ubicaciones" ADD CONSTRAINT "ubicaciones_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "almacenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes_producto" ADD CONSTRAINT "lotes_producto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario" ADD CONSTRAINT "inventario_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario" ADD CONSTRAINT "inventario_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "almacenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario" ADD CONSTRAINT "inventario_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "ubicaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "lotes_producto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "almacenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
