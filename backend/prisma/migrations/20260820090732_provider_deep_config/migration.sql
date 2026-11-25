-- AlterTable
ALTER TABLE "ApiProvider" ADD COLUMN     "gstPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "smsAlertOnFailure" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "smsAlertOnSuccess" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "UserNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserNotification_userId_idx" ON "UserNotification"("userId");

-- CreateIndex
CREATE INDEX "UserNotification_userId_isRead_idx" ON "UserNotification"("userId", "isRead");

-- AddForeignKey
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
