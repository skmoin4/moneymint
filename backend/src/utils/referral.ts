import { prisma } from "../config/prisma";

/** Short, human-shareable referral code, e.g. "MM7K3P2Q". Retries on the rare collision. */
export async function generateReferralCode(): Promise<string> {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
  for (let attempt = 0; attempt < 5; attempt++) {
    let code = "MM";
    for (let i = 0; i < 6; i++) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    const existing = await prisma.user.findUnique({ where: { referralCode: code } });
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique referral code");
}
