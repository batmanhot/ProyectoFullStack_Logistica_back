-- CreateTable
CREATE TABLE "plataforma_config" (
    "id" TEXT NOT NULL,
    "accesoRapidoTarjetas" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plataforma_config_pkey" PRIMARY KEY ("id")
);
