-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "clientRef" TEXT;

-- CreateTable
CREATE TABLE "ApiCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tokenHash" TEXT,
    "tokenPrefix" TEXT,
    "allowedIps" TEXT NOT NULL DEFAULT '',
    "callbackUrl" TEXT,
    "callbackMethod" TEXT NOT NULL DEFAULT 'POST',
    "callbackSecret" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerCallback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastHttpStatus" INTEGER,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerCallback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiCredential_userId_key" ON "ApiCredential"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiCredential_tokenHash_key" ON "ApiCredential"("tokenHash");

-- CreateIndex
CREATE INDEX "PartnerCallback_status_nextAttemptAt_idx" ON "PartnerCallback"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "PartnerCallback_userId_createdAt_idx" ON "PartnerCallback"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerCallback_transactionId_idx" ON "PartnerCallback"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_userId_clientRef_key" ON "Transaction"("userId", "clientRef");

-- AddForeignKey
ALTER TABLE "ApiCredential" ADD CONSTRAINT "ApiCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

