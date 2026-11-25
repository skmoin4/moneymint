import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import { verifyToken } from "../utils/jwt";

// Rate limiters that run before the `authenticate` middleware can't read req.user yet,
// so they decode the JWT directly here. Keying by user id (not just IP) matters for a
// consumer app: many retailers on the same mobile carrier share one public IP behind
// carrier-grade NAT, and IP-only limiting would let them throttle each other.
function userOrIpKey(req: Request): string {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const payload = verifyToken(header.slice(7));
      return `user:${payload.userId}`;
    } catch {
      // fall through to IP-based keying below
    }
  }
  return ipKeyGenerator(req.ip ?? "unknown");
}

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in a few minutes." },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { error: "Too many requests. Please slow down." },
});

export const transactionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { error: "Too many transaction requests. Please slow down." },
});
