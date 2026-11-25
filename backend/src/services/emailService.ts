import { prisma } from "../config/prisma";

/** Mock SMTP/email gateway — same not-fake-but-simulated pattern as smsService. */
export async function sendEmail(toEmail: string, subject: string, message: string): Promise<boolean> {
  await new Promise((resolve) => setTimeout(resolve, 150 + Math.random() * 200));

  const success = Math.random() >= 0.05;

  await prisma.emailLog.create({
    data: {
      toEmail,
      subject,
      message,
      status: success ? "SENT" : "FAILED",
      provider: "MockSMTP",
    },
  });

  return success;
}
