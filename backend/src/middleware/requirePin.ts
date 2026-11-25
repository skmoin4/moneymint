import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../config/prisma";

// Second-factor confirmation for money-movement actions (recharge, bill pay, DMT, AEPS,
// fund transfer) — opt-in per user, matching the consumer app's "Enable/Disable PIN"
// setting. A user who never set/enabled a PIN is unaffected.
export async function requirePinIfEnabled(req: Request, res: Response, next: NextFunction) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { pinEnabled: true, transactionPinHash: true },
  });
  if (!user?.pinEnabled) {
    return next();
  }

  const pin = req.body?.pin;
  if (typeof pin !== "string" || !pin) {
    return res.status(400).json({ error: "Transaction PIN is required" });
  }
  const valid = await bcrypt.compare(pin, user.transactionPinHash!);
  if (!valid) {
    return res.status(401).json({ error: "Incorrect transaction PIN" });
  }
  next();
}
