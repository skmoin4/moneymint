-- CreateEnum
CREATE TYPE "QueuedRechargeStatus" AS ENUM ('QUEUED', 'PROCESSED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "BalanceRequest" ADD COLUMN     "qrSettled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CommissionPack" ADD COLUMN     "globalCommissionType" "CommissionType",
ADD COLUMN     "globalValue" DECIMAL(6,2);

-- CreateTable
CREATE TABLE "PaymentMode" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappLog" (
    "id" TEXT NOT NULL,
    "toPhone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueuedRecharge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operatorCode" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "QueuedRechargeStatus" NOT NULL DEFAULT 'QUEUED',
    "resultMessage" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueuedRecharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMode_name_key" ON "PaymentMode"("name");

-- CreateIndex
CREATE INDEX "WhatsappLog_toPhone_idx" ON "WhatsappLog"("toPhone");

-- CreateIndex
CREATE INDEX "EmailLog_toEmail_idx" ON "EmailLog"("toEmail");

-- CreateIndex
CREATE INDEX "QueuedRecharge_userId_idx" ON "QueuedRecharge"("userId");

-- CreateIndex
CREATE INDEX "QueuedRecharge_status_idx" ON "QueuedRecharge"("status");

-- AddForeignKey
ALTER TABLE "QueuedRecharge" ADD CONSTRAINT "QueuedRecharge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
