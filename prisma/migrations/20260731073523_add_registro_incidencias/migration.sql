-- CreateEnum
CREATE TYPE "SeveridadIncidencia" AS ENUM ('CRITICO', 'ALTO', 'MEDIO', 'BAJO');

-- CreateTable
CREATE TABLE "registro_incidencias" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "usuarioNombre" TEXT,
    "modulo" TEXT NOT NULL,
    "opcion" TEXT NOT NULL,
    "codigoError" INTEGER NOT NULL,
    "mensaje" TEXT NOT NULL,
    "stackTrace" TEXT,
    "severidad" "SeveridadIncidencia" NOT NULL,
    "contexto" JSONB,
    "resuelto" BOOLEAN NOT NULL DEFAULT false,
    "notaResolucion" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registro_incidencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registro_incidencias_empresaId_severidad_idx" ON "registro_incidencias"("empresaId", "severidad");

-- CreateIndex
CREATE INDEX "registro_incidencias_empresaId_modulo_idx" ON "registro_incidencias"("empresaId", "modulo");

-- CreateIndex
CREATE INDEX "registro_incidencias_empresaId_timestamp_idx" ON "registro_incidencias"("empresaId", "timestamp");

-- AddForeignKey
ALTER TABLE "registro_incidencias" ADD CONSTRAINT "registro_incidencias_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
