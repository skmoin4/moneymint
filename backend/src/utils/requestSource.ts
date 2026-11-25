import type { Request } from "express";
import type { TransactionSource } from "../services/transactionEngine";

// Clients identify themselves with an X-Client-Source header: the web panel sends WEB,
// the mobile app sends APP (or nothing). Anything unrecognised is treated as APP — the
// value is display/filter metadata only, never used for authorization.
export function requestSource(req: Request): TransactionSource {
  const raw = (req.header("x-client-source") ?? "").toUpperCase();
  return raw === "WEB" || raw === "API" ? raw : "APP";
}
