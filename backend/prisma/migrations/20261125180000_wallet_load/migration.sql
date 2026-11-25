-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerReferenceType" ADD VALUE 'GATEWAY_CHARGE';
ALTER TYPE "LedgerReferenceType" ADD VALUE 'BALANCE_REQUEST';

-- AlterTable
ALTER TABLE "BalanceRequest" ADD COLUMN     "bankAccountId" TEXT,
ADD COLUMN     "depositedAt" TIMESTAMP(3),
ADD COLUMN     "paymentMode" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- AlterTable
ALTER TABLE "BankAccount" ADD COLUMN     "ownerId" TEXT;

-- AlterTable
ALTER TABLE "PaymentOrder" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'GATEWAY',
ADD COLUMN     "charges" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "method" TEXT,
ADD COLUMN     "netAmount" DECIMAL(14,2),
ADD COLUMN     "paidAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "UserPaymentQr" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "upiId" TEXT,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPaymentQr_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserPaymentQr_userId_key" ON "UserPaymentQr"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPaymentQr_externalId_key" ON "UserPaymentQr"("externalId");

-- CreateIndex
CREATE INDEX "BankAccount_ownerId_idx" ON "BankAccount"("ownerId");

-- CreateIndex
CREATE INDEX "PaymentOrder_channel_status_createdAt_idx" ON "PaymentOrder"("channel", "status", "createdAt");

