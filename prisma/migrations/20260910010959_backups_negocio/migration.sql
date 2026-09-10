-- CreateEnum
CREATE TYPE "EstadoRespaldo" AS ENUM ('VALIDANDO', 'COMPLETADO', 'FALLIDO');

-- CreateEnum
CREATE TYPE "IntegridadRespaldo" AS ENUM ('PENDIENTE', 'VERIFICADO', 'CON_OBSERVACIONES');

-- CreateEnum
CREATE TYPE "EstadoRestauracion" AS ENUM ('PENDIENTE_APROBACION', 'APROBADA', 'EN_EJECUCION', 'RESTAURADA', 'RECHAZADA');

-- CreateTable
CREATE TABLE "respaldos_negocio" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "alcance" TEXT NOT NULL,
    "estado" "EstadoRespaldo" NOT NULL DEFAULT 'VALIDANDO',
    "integridad" "IntegridadRespaldo" NOT NULL DEFAULT 'PENDIENTE',
    "tamanoBytes" BIGINT,
    "destinoNombre" TEXT NOT NULL,
    "destinoRegion" TEXT,
    "retencionDias" INTEGER NOT NULL DEFAULT 90,
    "cifrado" BOOLEAN NOT NULL DEFAULT true,
    "creadoPor" TEXT NOT NULL,
    "nota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "respaldos_negocio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_restauracion" (
    "id" TEXT NOT NULL,
    "respaldoId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "estado" "EstadoRestauracion" NOT NULL DEFAULT 'PENDIENTE_APROBACION',
    "motivo" TEXT NOT NULL,
    "solicitadoPor" TEXT NOT NULL,
    "aprobacionContacto" TEXT,
    "aprobacionEvidencia" TEXT,
    "aprobadoEn" TIMESTAMP(3),
    "ejecutadoEn" TIMESTAMP(3),
    "rechazoMotivo" TEXT,
    "nota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitudes_restauracion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_respaldo" (
    "id" TEXT NOT NULL,
    "respaldoId" TEXT,
    "restauracionId" TEXT,
    "empresaId" TEXT,
    "tipo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_respaldo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "respaldos_negocio_empresaId_idx" ON "respaldos_negocio"("empresaId");

-- CreateIndex
CREATE INDEX "respaldos_negocio_estado_idx" ON "respaldos_negocio"("estado");

-- CreateIndex
CREATE INDEX "solicitudes_restauracion_respaldoId_idx" ON "solicitudes_restauracion"("respaldoId");

-- CreateIndex
CREATE INDEX "solicitudes_restauracion_empresaId_idx" ON "solicitudes_restauracion"("empresaId");

-- CreateIndex
CREATE INDEX "solicitudes_restauracion_estado_idx" ON "solicitudes_restauracion"("estado");

-- CreateIndex
CREATE INDEX "eventos_respaldo_respaldoId_idx" ON "eventos_respaldo"("respaldoId");

-- CreateIndex
CREATE INDEX "eventos_respaldo_restauracionId_idx" ON "eventos_respaldo"("restauracionId");

-- AddForeignKey
ALTER TABLE "respaldos_negocio" ADD CONSTRAINT "respaldos_negocio_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_restauracion" ADD CONSTRAINT "solicitudes_restauracion_respaldoId_fkey" FOREIGN KEY ("respaldoId") REFERENCES "respaldos_negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_restauracion" ADD CONSTRAINT "solicitudes_restauracion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_respaldo" ADD CONSTRAINT "eventos_respaldo_respaldoId_fkey" FOREIGN KEY ("respaldoId") REFERENCES "respaldos_negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_respaldo" ADD CONSTRAINT "eventos_respaldo_restauracionId_fkey" FOREIGN KEY ("restauracionId") REFERENCES "solicitudes_restauracion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
