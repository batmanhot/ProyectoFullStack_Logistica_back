-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "condicionPago" TEXT,
ADD COLUMN     "limiteCredito" DECIMAL(12,2),
ADD COLUMN     "notas" TEXT;

-- AlterTable
ALTER TABLE "despachos" ADD COLUMN     "evidenciaFoto" TEXT,
ADD COLUMN     "evidenciaNotas" TEXT,
ADD COLUMN     "receptorNombre" TEXT;
