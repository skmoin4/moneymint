-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('COMMISSION', 'SURCHARGE');

-- AlterEnum
ALTER TYPE "LedgerReferenceType" ADD VALUE 'SURCHARGE';

-- DropIndex
DROP INDEX "CommissionSlab_packId_idx";

-- DropIndex
DROP INDEX "CommissionSlab_packId_operatorId_key";

-- AlterTable
ALTER TABLE "CommissionSlab" ADD COLUMN     "chargeType" "ChargeType" NOT NULL DEFAULT 'COMMISSION',
ALTER COLUMN "value" SET DATA TYPE DECIMAL(8,2);

-- AlterTable
ALTER TABLE "OperatorApiMapping" ADD COLUMN     "vendorCommissionType" "CommissionType",
ADD COLUMN     "vendorCommissionValue" DECIMAL(8,2);

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "surcharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "vendorCommission" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CommissionPayout" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "role" "Role" NOT NULL,
    "gross" DECIMAL(14,2) NOT NULL,
    "tds" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(14,2) NOT NULL,
    "reversed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommissionPayout_transactionId_idx" ON "CommissionPayout"("transactionId");

-- CreateIndex
CREATE INDEX "CommissionPayout_userId_createdAt_idx" ON "CommissionPayout"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CommissionSlab_packId_operatorId_idx" ON "CommissionSlab"("packId", "operatorId");

-- AddForeignKey
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

