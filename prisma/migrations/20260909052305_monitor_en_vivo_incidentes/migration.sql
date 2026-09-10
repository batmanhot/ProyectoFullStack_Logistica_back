-- CreateTable
CREATE TABLE "incidentes_monitor" (
    "id" TEXT NOT NULL,
    "servicio" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "severidad" TEXT NOT NULL,
    "detalle" TEXT,
    "inicioAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resueltoAt" TIMESTAMP(3),

    CONSTRAINT "incidentes_monitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incidentes_monitor_resueltoAt_idx" ON "incidentes_monitor"("resueltoAt");

-- CreateIndex
CREATE INDEX "incidentes_monitor_servicio_idx" ON "incidentes_monitor"("servicio");
