-- CreateTable
CREATE TABLE "auditoria_plataforma" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "recurso" TEXT NOT NULL,
    "recursoId" TEXT,
    "empresaId" TEXT,
    "detalle" TEXT NOT NULL,
    "datos" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_plataforma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertas_envio" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "reglaId" TEXT NOT NULL,
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "canal" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "error" TEXT,
    "enviadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alertas_envio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auditoria_plataforma_adminId_idx" ON "auditoria_plataforma"("adminId");

-- CreateIndex
CREATE INDEX "auditoria_plataforma_recurso_recursoId_idx" ON "auditoria_plataforma"("recurso", "recursoId");

-- CreateIndex
CREATE INDEX "auditoria_plataforma_empresaId_idx" ON "auditoria_plataforma"("empresaId");

-- CreateIndex
CREATE INDEX "alertas_envio_empresaId_idx" ON "alertas_envio"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "alertas_envio_empresaId_reglaId_fechaVencimiento_canal_key" ON "alertas_envio"("empresaId", "reglaId", "fechaVencimiento", "canal");

-- AddForeignKey
ALTER TABLE "auditoria_plataforma" ADD CONSTRAINT "auditoria_plataforma_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "platform_admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_plataforma" ADD CONSTRAINT "auditoria_plataforma_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas_envio" ADD CONSTRAINT "alertas_envio_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas_envio" ADD CONSTRAINT "alertas_envio_reglaId_fkey" FOREIGN KEY ("reglaId") REFERENCES "reglas_alerta_vencimiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
