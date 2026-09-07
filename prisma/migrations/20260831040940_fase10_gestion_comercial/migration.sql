-- CreateEnum
CREATE TYPE "EstadoOportunidad" AS ENUM ('NUEVA', 'CALIFICADA', 'COTIZADA', 'EN_NEGOCIACION', 'GANADA', 'PERDIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoActividadComercial" AS ENUM ('LLAMADA', 'WHATSAPP', 'EMAIL', 'REUNION', 'VISITA', 'VIDEOLLAMADA', 'COTIZACION_ENVIADA', 'COTIZACION_MODIFICADA', 'NEGOCIACION', 'OTRO');

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "fuente" TEXT,
ADD COLUMN     "responsableComercialId" TEXT;

-- AlterTable
ALTER TABLE "proformas" ADD COLUMN     "oportunidadId" TEXT;

-- CreateTable
CREATE TABLE "oportunidades" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "contacto" TEXT,
    "descripcion" TEXT NOT NULL,
    "necesidad" TEXT,
    "responsableId" TEXT NOT NULL,
    "estado" "EstadoOportunidad" NOT NULL DEFAULT 'NUEVA',
    "valorEstimado" DECIMAL(12,2) NOT NULL,
    "probabilidad" INTEGER NOT NULL DEFAULT 10,
    "fuente" TEXT,
    "fechaEstimadaCierre" TIMESTAMP(3),
    "fechaCierre" TIMESTAMP(3),
    "motivoPerdida" TEXT,
    "observaciones" TEXT,
    "fechaUltimaActividad" TIMESTAMP(3),
    "proximaAccion" TEXT,
    "fechaProximaAccion" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oportunidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actividades_comerciales" (
    "id" TEXT NOT NULL,
    "oportunidadId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" "TipoActividadComercial" NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultado" TEXT NOT NULL,
    "comentarios" TEXT,
    "proximaAccion" TEXT,
    "fechaProximaAccion" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actividades_comerciales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "oportunidades_empresaId_idx" ON "oportunidades"("empresaId");

-- CreateIndex
CREATE INDEX "oportunidades_empresaId_estado_idx" ON "oportunidades"("empresaId", "estado");

-- CreateIndex
CREATE INDEX "oportunidades_empresaId_responsableId_idx" ON "oportunidades"("empresaId", "responsableId");

-- CreateIndex
CREATE UNIQUE INDEX "oportunidades_empresaId_codigo_key" ON "oportunidades"("empresaId", "codigo");

-- CreateIndex
CREATE INDEX "actividades_comerciales_oportunidadId_idx" ON "actividades_comerciales"("oportunidadId");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_responsableComercialId_fkey" FOREIGN KEY ("responsableComercialId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_oportunidadId_fkey" FOREIGN KEY ("oportunidadId") REFERENCES "oportunidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividades_comerciales" ADD CONSTRAINT "actividades_comerciales_oportunidadId_fkey" FOREIGN KEY ("oportunidadId") REFERENCES "oportunidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividades_comerciales" ADD CONSTRAINT "actividades_comerciales_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
