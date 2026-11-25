import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../utils/jwt";
import { prisma } from "../config/prisma";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = header.slice("Bearer ".length);
  let payload: JwtPayload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // tokenVersion lets "Logout All Devices" invalidate every previously issued JWT at once,
  // even though JWTs are otherwise stateless.
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { tokenVersion: true, status: true },
  });
  if (!user || user.tokenVersion !== payload.tokenVersion) {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }
  // Suspending/deactivating an account takes effect immediately, even for live sessions.
  if (user.status !== "ACTIVE") {
    return res.status(403).json({ error: `Your account is ${user.status.toLowerCase()}. Contact your distributor.` });
  }

  req.user = payload;
  next();
}

export function authorize(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
