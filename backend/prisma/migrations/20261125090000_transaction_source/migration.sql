-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'APP';

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");
