-- CreateTable
CREATE TABLE "Remitter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobileNumber" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Remitter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Beneficiary" (
    "id" TEXT NOT NULL,
    "remitterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Beneficiary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Remitter_mobileNumber_key" ON "Remitter"("mobileNumber");

-- CreateIndex
CREATE INDEX "Remitter_userId_idx" ON "Remitter"("userId");

-- CreateIndex
CREATE INDEX "Beneficiary_remitterId_idx" ON "Beneficiary"("remitterId");

-- AddForeignKey
ALTER TABLE "Remitter" ADD CONSTRAINT "Remitter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beneficiary" ADD CONSTRAINT "Beneficiary_remitterId_fkey" FOREIGN KEY ("remitterId") REFERENCES "Remitter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

