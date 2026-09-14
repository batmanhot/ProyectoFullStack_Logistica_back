-- CreateTable
CREATE TABLE "atenciones_alerta" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "notaAccion" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "atenciones_alerta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "atenciones_alerta_empresaId_idx" ON "atenciones_alerta"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "atenciones_alerta_empresaId_tipo_clave_key" ON "atenciones_alerta"("empresaId", "tipo", "clave");

-- AddForeignKey
ALTER TABLE "atenciones_alerta" ADD CONSTRAINT "atenciones_alerta_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atenciones_alerta" ADD CONSTRAINT "atenciones_alerta_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- Row-Level Security — atenciones_alerta (empresaId directo)
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE atenciones_alerta ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON atenciones_alerta
  USING ("empresaId" = current_setting('app.current_tenant', true));
