import type { Request } from "express";
import { prisma } from "../config/prisma";

// IP Whitelist is an admin-office security control — it must never apply to
// the retailer/consumer app, which is used from cell networks all over the
// country. Called only for ADMIN-role logins, after the user is identified,
// so a whitelist entry can never lock the app out for everyone else.
// If no active whitelist entries exist, access is open (safe default so an
// empty list never locks the admin out either).
export async function isIpAllowedForAdmin(req: Request): Promise<{ allowed: boolean; ip: string }> {
  const requestIp = (req.ip ?? "").replace("::ffff:", "");
  const activeEntries = await prisma.ipWhitelistEntry.count({ where: { isActive: true } });
  if (activeEntries === 0) {
    return { allowed: true, ip: requestIp };
  }
  const allowed = await prisma.ipWhitelistEntry.findFirst({
    where: { isActive: true, ipAddress: requestIp },
  });
  return { allowed: Boolean(allowed), ip: requestIp };
}
