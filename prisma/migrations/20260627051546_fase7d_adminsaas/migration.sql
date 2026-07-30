-- CreateEnum
CREATE TYPE "EstadoRenovacion" AS ENUM ('PAGADO', 'PENDIENTE', 'FALLIDO', 'ANULADO');

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "fechaVencimiento" TIMESTAMP(3),
ADD COLUMN     "notas" TEXT,
ADD COLUMN     "telefono" TEXT;

-- CreateTable
CREATE TABLE "platform_admins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planes_saas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precioMensual" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "precioAnual" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "destacado" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "vigenciaDias" INTEGER NOT NULL DEFAULT 30,
    "caracteristicas" TEXT[],
    "maxUsuarios" INTEGER NOT NULL DEFAULT 1,
    "maxProductos" INTEGER NOT NULL DEFAULT 100,
    "maxAlmacenes" INTEGER NOT NULL DEFAULT 1,
    "maxProveedores" INTEGER NOT NULL DEFAULT 10,
    "maxClientes" INTEGER NOT NULL DEFAULT 20,
    "maxOrdenesMes" INTEGER NOT NULL DEFAULT 50,
    "almacenamientoGB" INTEGER NOT NULL DEFAULT 1,
    "soporte" TEXT NOT NULL DEFAULT 'email',
    "apiAccess" BOOLEAN NOT NULL DEFAULT false,
    "multiEmpresa" BOOLEAN NOT NULL DEFAULT false,
    "exportAvanzada" BOOLEAN NOT NULL DEFAULT false,
    "reportesAvanzados" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planes_saas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "renovaciones_plan" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'USD',
    "ciclo" TEXT NOT NULL,
    "fechaPago" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metodoPago" TEXT NOT NULL,
    "periodoInicio" TIMESTAMP(3) NOT NULL,
    "periodoFin" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoRenovacion" NOT NULL DEFAULT 'PAGADO',
    "comprobante" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "renovaciones_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reglas_alerta_vencimiento" (
    "id" TEXT NOT NULL,
    "diasAntes" INTEGER NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "canales" TEXT[],
    "asunto" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reglas_alerta_vencimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "landing_config" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "landing_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");

-- AddForeignKey
ALTER TABLE "renovaciones_plan" ADD CONSTRAINT "renovaciones_plan_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renovaciones_plan" ADD CONSTRAINT "renovaciones_plan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "planes_saas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
