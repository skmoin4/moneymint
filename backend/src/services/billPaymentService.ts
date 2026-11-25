import { prisma } from "../config/prisma";
import { HttpError } from "../utils/httpError";
import { processProviderTransaction, type TransactionSource } from "./transactionEngine";

export interface BillDetails {
  consumerName: string;
  dueAmount: number;
  dueDate: string;
}

/**
 * Stands in for a real BBPS biller lookup. Deterministic on the consumer
 * number so repeated fetches for the same consumer return the same bill.
 */
export async function fetchBillAmount(operatorCode: string, consumerNumber: string): Promise<BillDetails> {
  const operator = await prisma.operator.findUnique({ where: { code: operatorCode } });
  if (!operator) {
    throw new HttpError(404, "Operator not found");
  }

  let seed = 0;
  for (const char of consumerNumber) seed = (seed * 31 + char.charCodeAt(0)) % 100000;

  const dueAmount = 150 + (seed % 3000);
  const dueDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return {
    consumerName: `Consumer ${consumerNumber.slice(-4)}`,
    dueAmount,
    dueDate,
  };
}

export async function payBill(
  userId: string,
  operatorCode: string,
  consumerNumber: string,
  amount: number,
  source: TransactionSource = "APP"
) {
  return processProviderTransaction({
    userId,
    operatorCode,
    identifier: consumerNumber,
    amount,
    transactionType: "BBPS",
    source,
    descriptionLabel: "Bill payment",
  });
}
