import { processProviderTransaction } from "./transactionEngine";

export async function initiateRecharge(
  userId: string,
  operatorCode: string,
  mobileNumber: string,
  amount: number
) {
  return processProviderTransaction({
    userId,
    operatorCode,
    identifier: mobileNumber,
    amount,
    transactionType: "RECHARGE",
    descriptionLabel: "Recharge",
  });
}
