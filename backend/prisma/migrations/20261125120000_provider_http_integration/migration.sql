-- AlterTable
ALTER TABLE "ApiProvider" ADD COLUMN     "callbackToken" TEXT,
ADD COLUMN     "httpConfig" JSONB,
ADD COLUMN     "integrationType" TEXT NOT NULL DEFAULT 'MOCK';

-- AlterTable
ALTER TABLE "OperatorApiMapping" ADD COLUMN     "providerOperatorCode" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "lastStatusCheckAt" TIMESTAMP(3),
ADD COLUMN     "statusCheckCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "statusMessage" TEXT,
ADD COLUMN     "vendorRefId" TEXT;

-- CreateTable
CREATE TABLE "ProviderCallLog" (
    "id" TEXT NOT NULL,
    "apiProviderId" TEXT NOT NULL,
    "transactionId" TEXT,
    "kind" TEXT NOT NULL,
    "method" TEXT,
    "url" TEXT,
    "requestBody" TEXT,
    "httpStatus" INTEGER,
    "responseBody" TEXT,
    "parsedStatus" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderCallLog_transactionId_idx" ON "ProviderCallLog"("transactionId");

-- CreateIndex
CREATE INDEX "ProviderCallLog_apiProviderId_createdAt_idx" ON "ProviderCallLog"("apiProviderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiProvider_callbackToken_key" ON "ApiProvider"("callbackToken");

-- CreateIndex
CREATE INDEX "Transaction_vendorRefId_idx" ON "Transaction"("vendorRefId");

