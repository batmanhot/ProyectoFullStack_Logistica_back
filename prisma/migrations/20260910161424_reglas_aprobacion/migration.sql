-- CreateEnum
CREATE TYPE "ProcesoAprobacion" AS ENUM ('PEDIDO_INTERNO', 'DESPACHO', 'PEDIDO_PORTAL', 'FACTURA_B2B');

-- CreateTable
CREATE TABLE "reglas_aprobacion" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "proceso" "ProcesoAprobacion" NOT NULL,
    "rolesAprobadores" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reglas_aprobacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reglas_aprobacion_empresaId_idx" ON "reglas_aprobacion"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "reglas_aprobacion_empresaId_proceso_key" ON "reglas_aprobacion"("empresaId", "proceso");

-- AddForeignKey
ALTER TABLE "reglas_aprobacion" ADD CONSTRAINT "reglas_aprobacion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- Row-Level Security — reglas_aprobacion (empresaId directo)
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE reglas_aprobacion ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reglas_aprobacion
  USING ("empresaId" = current_setting('app.current_tenant', true));

-- ═══════════════════════════════════════════════════════════════════
-- Backfill — cada empresa existente nace con las 4 reglas en su valor ACTUAL,
-- para que el día 1 el comportamiento sea idéntico al @SoloRoles hardcodeado:
--   · PEDIDO_INTERNO → ['supervisor','gerente-operaciones'] (lo que exige hoy)
--   · DESPACHO / PEDIDO_PORTAL / FACTURA_B2B → [] (hoy basta el permiso de módulo)
-- El seed (sembrarReglasAprobacion) hace lo mismo de forma idempotente para
-- las bases nuevas; este bloque cubre las empresas ya creadas.
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO "reglas_aprobacion" ("id", "empresaId", "proceso", "rolesAprobadores", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e.id, v.proceso::"ProcesoAprobacion", v.roles, now(), now()
FROM "empresas" e
CROSS JOIN (VALUES
  ('PEDIDO_INTERNO', ARRAY['supervisor','gerente-operaciones']),
  ('DESPACHO',       ARRAY[]::text[]),
  ('PEDIDO_PORTAL',  ARRAY[]::text[]),
  ('FACTURA_B2B',    ARRAY[]::text[])
) AS v(proceso, roles)
ON CONFLICT ("empresaId", "proceso") DO NOTHING;
