-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('RECHARGE', 'BBPS', 'DMT', 'AEPS');

-- Rename column (preserves existing data, unlike drop+add)
ALTER TABLE "Transaction" RENAME COLUMN "mobileNumber" TO "identifier";

-- Add type column, backfilling existing rows as RECHARGE
ALTER TABLE "Transaction" ADD COLUMN "type" "TransactionType" NOT NULL DEFAULT 'RECHARGE';

-- Recreate index under the new column name
DROP INDEX "Transaction_mobileNumber_idx";
CREATE INDEX "Transaction_identifier_idx" ON "Transaction"("identifier");
