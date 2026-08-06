/*
  Warnings:

  - Added the required column `empresaId` to the `push_subscriptions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "push_subscriptions" ADD COLUMN     "empresaId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "push_subscriptions_empresaId_idx" ON "push_subscriptions"("empresaId");
