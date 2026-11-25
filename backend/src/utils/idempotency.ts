import { z } from "zod";
import { prisma } from "../config/prisma";
import type { Transaction } from "../generated/prisma/client";

/**
 * Optional `clientRef` on the app's payment endpoints: the app generates one id (e.g. a
 * UUID) when the user taps Pay and reuses it on any retry of that same payment. A repeat
 * returns the original transaction (`duplicate: true`) instead of charging again — so a
 * dropped connection never turns into a double recharge. Unique per user at the DB level.
 */
export const clientRefField = z
  .string()
  .min(8, "clientRef must be at least 8 characters")
  .max(64)
  .regex(/^[A-Za-z0-9_.-]+$/, "clientRef: letters, digits, _ . - only")
  .optional();

export async function runOnce(
  userId: string,
  clientRef: string | undefined,
  create: () => Promise<Transaction>
): Promise<{ transaction: Transaction; duplicate: boolean }> {
  if (clientRef) {
    const existing = await prisma.transaction.findUnique({ where: { userId_clientRef: { userId, clientRef } } });
    if (existing) return { transaction: existing, duplicate: true };
  }
  try {
    return { transaction: await create(), duplicate: false };
  } catch (err) {
    // Two identical requests raced: the loser hits the unique constraint.
    if (clientRef && (err as { code?: string }).code === "P2002") {
      const existing = await prisma.transaction.findUnique({ where: { userId_clientRef: { userId, clientRef } } });
      if (existing) return { transaction: existing, duplicate: true };
    }
    throw err;
  }
}
