-- AlterTable
ALTER TABLE "ApiProvider" ADD COLUMN     "secondaryWalletBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "secondaryWalletLabel" TEXT NOT NULL DEFAULT 'Wallet 2',
ADD COLUMN     "walletBalance" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ProviderWalletEntry" (
    "id" TEXT NOT NULL,
    "apiProviderId" TEXT NOT NULL,
    "walletSlot" INTEGER NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "description" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderWalletEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderWalletEntry_apiProviderId_idx" ON "ProviderWalletEntry"("apiProviderId");

-- AddForeignKey
ALTER TABLE "ProviderWalletEntry" ADD CONSTRAINT "ProviderWalletEntry_apiProviderId_fkey" FOREIGN KEY ("apiProviderId") REFERENCES "ApiProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
