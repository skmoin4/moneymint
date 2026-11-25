import { prisma } from "../config/prisma";

/**
 * Stands in for a real SMS gateway (MSG91, Fast2SMS, etc.) until real API
 * credentials are configured. Every send is still logged to SmsLog so the
 * SMS Logs report reflects real attempts, just against a simulated carrier.
 */
export async function sendSms(toPhone: string, message: string, purpose: string): Promise<boolean> {
  await new Promise((resolve) => setTimeout(resolve, 150 + Math.random() * 200));

  const success = Math.random() >= 0.05;

  await prisma.smsLog.create({
    data: {
      toPhone,
      message,
      purpose,
      status: success ? "SENT" : "FAILED",
      provider: "MockSMS",
    },
  });

  return success;
}
