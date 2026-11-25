import { prisma } from "../config/prisma";

/** Mock WhatsApp Business API gateway — same not-fake-but-simulated pattern as smsService. */
export async function sendWhatsapp(toPhone: string, message: string): Promise<boolean> {
  await new Promise((resolve) => setTimeout(resolve, 150 + Math.random() * 200));

  const success = Math.random() >= 0.05;

  await prisma.whatsappLog.create({
    data: {
      toPhone,
      message,
      status: success ? "SENT" : "FAILED",
      provider: "MockWhatsapp",
    },
  });

  return success;
}
