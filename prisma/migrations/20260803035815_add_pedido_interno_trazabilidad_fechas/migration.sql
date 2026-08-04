-- AlterTable
ALTER TABLE "pedidos_internos" ADD COLUMN     "fechaEnvio" TIMESTAMP(3),
ADD COLUMN     "fechaPicking" TIMESTAMP(3),
ADD COLUMN     "fechaRechazo" TIMESTAMP(3);
