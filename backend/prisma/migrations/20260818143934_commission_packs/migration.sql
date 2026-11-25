-- Restructure commission model: a single slab-per-operator-per-user becomes a
-- CommissionPack that can bundle a slab for every operator, so one user assignment
-- earns commission across all of a pack's operators instead of just one.
-- Test-only commission config data is reset here; Users/Wallets/Transactions/Ledger are untouched.

-- Drop the old User -> CommissionSlab link first (data is being restructured, not preserved 1:1)
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_commissionSlabId_fkey";
ALTER TABLE "User" DROP COLUMN "commissionSlabId";

-- Drop the old CommissionSlab table
DROP TABLE "CommissionSlab";

-- CreateTable
CREATE TABLE "CommissionPack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionPack_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommissionPack_name_key" ON "CommissionPack"("name");

-- CreateTable (recreated with packId instead of name)
CREATE TABLE "CommissionSlab" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "commissionType" "CommissionType" NOT NULL,
    "value" DECIMAL(6,2) NOT NULL,
    "minAmount" DECIMAL(14,2),
    "maxAmount" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionSlab_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommissionSlab_packId_operatorId_key" ON "CommissionSlab"("packId", "operatorId");
CREATE INDEX "CommissionSlab_operatorId_idx" ON "CommissionSlab"("operatorId");
CREATE INDEX "CommissionSlab_packId_idx" ON "CommissionSlab"("packId");

ALTER TABLE "CommissionSlab" ADD CONSTRAINT "CommissionSlab_packId_fkey" FOREIGN KEY ("packId") REFERENCES "CommissionPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionSlab" ADD CONSTRAINT "CommissionSlab_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: User gets commissionPackId instead of commissionSlabId
ALTER TABLE "User" ADD COLUMN "commissionPackId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_commissionPackId_fkey" FOREIGN KEY ("commissionPackId") REFERENCES "CommissionPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;
