import { processProviderTransaction, type TransactionSource } from "./transactionEngine";

export async function initiateRecharge(
  userId: string,
  operatorCode: string,
  mobileNumber: string,
  amount: number,
  source: TransactionSource = "APP",
  clientRef?: string
) {
  return processProviderTransaction({
    userId,
    operatorCode,
    identifier: mobileNumber,
    amount,
    transactionType: "RECHARGE",
    source,
    clientRef,
    descriptionLabel: "Recharge",
  });
}
