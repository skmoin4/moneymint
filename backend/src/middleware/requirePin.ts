import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../config/prisma";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// Second-factor confirmation for money-movement actions (recharge, bill pay, DMT, AEPS,
// fund transfer) — opt-in per user, matching the consumer app's "Enable/Disable PIN"
// setting. A user who never set/enabled a PIN is unaffected.
//
// A wrong PIN answers 400 (not 401): 401 means "session invalid" to clients, and a typo
// must not log the user out. Five wrong PINs in a row lock PIN-protected actions for 15
// minutes so the PIN can't be guessed.
export interface PinCheckFailure {
  status: number;
  body: { error: string; code: "PIN_LOCKED" | "PIN_REQUIRED" | "PIN_INCORRECT" | "PIN_NOT_SET" };
}

/**
 * Verifies a user's transaction PIN with the lockout rules. Returns null when correct,
 * otherwise the HTTP status and body to send. Used by the middleware below and by the
 * change/disable-PIN endpoints (which must prove the current PIN).
 */
export async function checkPin(userId: string, pin: unknown): Promise<PinCheckFailure | null> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { transactionPinHash: true, pinFailedAttempts: true, pinLockedUntil: true },
  });
  if (!user.transactionPinHash) return { status: 400, body: { error: "No transaction PIN is set", code: "PIN_NOT_SET" } };
  if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
    const mins = Math.ceil((user.pinLockedUntil.getTime() - Date.now()) / 60000);
    return { status: 423, body: { error: `Too many wrong PIN attempts. Try again in ${mins} minute(s).`, code: "PIN_LOCKED" } };
  }
  if (typeof pin !== "string" || !pin) {
    return { status: 400, body: { error: "Transaction PIN is required", code: "PIN_REQUIRED" } };
  }
  if (!(await bcrypt.compare(pin, user.transactionPinHash))) {
    const attempts = user.pinFailedAttempts + 1;
    const lock = attempts >= MAX_ATTEMPTS;
    await prisma.user.update({
      where: { id: userId },
      data: lock
        ? { pinFailedAttempts: 0, pinLockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
        : { pinFailedAttempts: attempts },
    });
    return lock
      ? { status: 423, body: { error: `Too many wrong PIN attempts. Try again in ${LOCK_MINUTES} minutes.`, code: "PIN_LOCKED" } }
      : { status: 400, body: { error: `Incorrect transaction PIN (${MAX_ATTEMPTS - attempts} attempt(s) left)`, code: "PIN_INCORRECT" } };
  }
  if (user.pinFailedAttempts > 0 || user.pinLockedUntil) {
    await prisma.user.update({ where: { id: userId }, data: { pinFailedAttempts: 0, pinLockedUntil: null } });
  }
  return null;
}

export async function requirePinIfEnabled(req: Request, res: Response, next: NextFunction) {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { pinEnabled: true } });
  if (!user?.pinEnabled) {
    return next();
  }
  const failure = await checkPin(req.user!.userId, req.body?.pin);
  if (failure) return res.status(failure.status).json(failure.body);
  next();
}
