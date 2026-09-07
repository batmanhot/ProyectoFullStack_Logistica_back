-- CreateEnum
CREATE TYPE "EstadoProyecto" AS ENUM ('EN_EJECUCION', 'CERRADO');

-- AlterTable
ALTER TABLE "movimientos" ADD COLUMN     "proyectoId" TEXT;

-- AlterTable
ALTER TABLE "pedidos_internos" ADD COLUMN     "proyectoId" TEXT;

-- CreateTable
CREATE TABLE "cdrs" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "responsable" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cdrs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyectos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "clienteId" TEXT,
    "cdrId" TEXT,
    "estado" "EstadoProyecto" NOT NULL DEFAULT 'EN_EJECUCION',
    "fechaInicio" TIMESTAMP(3),
    "fechaFin" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proyectos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cdrs_empresaId_idx" ON "cdrs"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "cdrs_empresaId_codigo_key" ON "cdrs"("empresaId", "codigo");

-- CreateIndex
CREATE INDEX "proyectos_empresaId_idx" ON "proyectos"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "proyectos_empresaId_codigo_key" ON "proyectos"("empresaId", "codigo");

-- AddForeignKey
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_internos" ADD CONSTRAINT "pedidos_internos_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cdrs" ADD CONSTRAINT "cdrs_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_cdrId_fkey" FOREIGN KEY ("cdrId") REFERENCES "cdrs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
