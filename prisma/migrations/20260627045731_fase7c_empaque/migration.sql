-- CreateEnum
CREATE TYPE "EstadoEmpaque" AS ENUM ('PENDIENTE', 'CONFIRMADO');

-- CreateTable
CREATE TABLE "empaques" (
    "id" TEXT NOT NULL,
    "despachoId" TEXT NOT NULL,
    "tipoCajaId" TEXT NOT NULL,
    "bultos" INTEGER NOT NULL DEFAULT 1,
    "pesoTotal" DECIMAL(10,2),
    "instrucciones" TEXT,
    "fragil" BOOLEAN NOT NULL DEFAULT false,
    "estado" "EstadoEmpaque" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empaques_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empaques_despachoId_key" ON "empaques"("despachoId");

-- AddForeignKey
ALTER TABLE "empaques" ADD CONSTRAINT "empaques_despachoId_fkey" FOREIGN KEY ("despachoId") REFERENCES "despachos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
