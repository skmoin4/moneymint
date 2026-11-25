export class ProviderDownError extends Error {}

export interface ProviderRequest {
  mobileNumber: string;
  amount: number;
  operatorCode: string;
}

export interface ProviderResult {
  success: boolean;
  providerRefId: string;
  rawResponse: Record<string, unknown>;
}

/**
 * Stands in for a real upstream recharge vendor until we integrate one.
 * ~10% of calls simulate the provider being unreachable (triggers failover),
 * ~10% of the remainder simulate a genuine recharge failure (triggers refund).
 * mobileNumber "0000000000" always fails, for deterministic refund-path testing.
 */
export async function callProvider(
  providerCode: string,
  req: ProviderRequest
): Promise<ProviderResult> {
  await new Promise((resolve) => setTimeout(resolve, 150 + Math.random() * 250));

  if (Math.random() < 0.1) {
    throw new ProviderDownError(`${providerCode} is unreachable`);
  }

  const forcedFailure = req.mobileNumber === "0000000000";
  const success = !forcedFailure && Math.random() >= 0.1;

  return {
    success,
    providerRefId: `${providerCode}-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    rawResponse: {
      provider: providerCode,
      status: success ? "SUCCESS" : "FAILED",
      mobileNumber: req.mobileNumber,
      amount: req.amount,
    },
  };
}
