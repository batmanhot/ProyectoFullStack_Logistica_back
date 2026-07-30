-- CreateTable
CREATE TABLE "vehiculos_flota" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "anio" INTEGER,
    "conductor" TEXT,
    "kmActual" DECIMAL(10,1) NOT NULL DEFAULT 0,
    "vencSoat" TIMESTAMP(3),
    "vencRevTecnica" TIMESTAMP(3),
    "proxMantenimiento" TIMESTAMP(3),
    "transportistaId" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehiculos_flota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mantenimientos_vehiculo" (
    "id" TEXT NOT NULL,
    "vehiculoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kmActual" DECIMAL(10,1),
    "costo" DECIMAL(12,2),
    "taller" TEXT,
    "observaciones" TEXT,
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mantenimientos_vehiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registros_combustible" (
    "id" TEXT NOT NULL,
    "vehiculoId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "litros" DECIMAL(10,2) NOT NULL,
    "costo" DECIMAL(12,2) NOT NULL,
    "kmAntes" DECIMAL(10,1),
    "kmDespues" DECIMAL(10,1),
    "kmRecorridos" DECIMAL(10,1) NOT NULL DEFAULT 0,
    "tipoCombustible" TEXT,
    "proveedor" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registros_combustible_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehiculos_flota_empresaId_idx" ON "vehiculos_flota"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "vehiculos_flota_empresaId_placa_key" ON "vehiculos_flota"("empresaId", "placa");

-- AddForeignKey
ALTER TABLE "vehiculos_flota" ADD CONSTRAINT "vehiculos_flota_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehiculos_flota" ADD CONSTRAINT "vehiculos_flota_transportistaId_fkey" FOREIGN KEY ("transportistaId") REFERENCES "transportistas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimientos_vehiculo" ADD CONSTRAINT "mantenimientos_vehiculo_vehiculoId_fkey" FOREIGN KEY ("vehiculoId") REFERENCES "vehiculos_flota"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimientos_vehiculo" ADD CONSTRAINT "mantenimientos_vehiculo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_combustible" ADD CONSTRAINT "registros_combustible_vehiculoId_fkey" FOREIGN KEY ("vehiculoId") REFERENCES "vehiculos_flota"("id") ON DELETE CASCADE ON UPDATE CASCADE;
