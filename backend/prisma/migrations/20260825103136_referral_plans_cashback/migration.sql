-- AlterEnum
ALTER TYPE "LedgerReferenceType" ADD VALUE 'CASHBACK';
ALTER TYPE "LedgerReferenceType" ADD VALUE 'REFERRAL_REWARD';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredById" TEXT;

-- CreateTable
CREATE TABLE "OperatorPrefix" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorPrefix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RechargePlan" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "validity" TEXT,
    "data" TEXT,
    "talktime" TEXT,
    "sms" TEXT,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Popular',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RechargePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashbackOffer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "operatorId" TEXT,
    "minAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "percent" DECIMAL(5,2) NOT NULL,
    "maxCashback" DECIMAL(14,2),
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashbackOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperatorPrefix_prefix_key" ON "OperatorPrefix"("prefix");

-- CreateIndex
CREATE INDEX "OperatorPrefix_operatorId_idx" ON "OperatorPrefix"("operatorId");

-- CreateIndex
CREATE INDEX "RechargePlan_operatorId_idx" ON "RechargePlan"("operatorId");

-- CreateIndex
CREATE INDEX "CashbackOffer_operatorId_idx" ON "CashbackOffer"("operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorPrefix" ADD CONSTRAINT "OperatorPrefix_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RechargePlan" ADD CONSTRAINT "RechargePlan_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashbackOffer" ADD CONSTRAINT "CashbackOffer_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
