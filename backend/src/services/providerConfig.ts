import { z } from "zod";

/**
 * Describes a real vendor's recharge API entirely as data — the "API Parsing Setting"
 * screen. Every Indian recharge vendor follows the same pattern (GET/POST with a member
 * id + token + number + amount + operator code + our txn id; JSON or plain-text reply with
 * a status word, an operator ref and the vendor's txn id; a status-check URL; a callback
 * to our URL), only the field names differ. So adding a vendor is filling this in.
 *
 * Templates accept placeholders: {mobile} {amount} {opcode} {txnid} {apikey} {apisecret}
 * {memberid} {vendorref} {callbackurl}. Values are URL-encoded inside URLs and form
 * bodies and JSON-escaped inside JSON bodies.
 */
export const httpConfigSchema = z.object({
  memberId: z.string().max(200).optional().default(""),

  // Recharge request
  method: z.enum(["GET", "POST"]).default("GET"),
  url: z.string().max(2000).default(""),
  contentType: z.enum(["FORM", "JSON"]).default("FORM"),
  bodyTemplate: z.string().max(4000).optional().default(""),
  headers: z.string().max(2000).optional().default(""), // one "Name: value" per line
  timeoutSeconds: z.number().int().min(5).max(180).default(60),

  // Reading the reply
  responseFormat: z.enum(["JSON", "TEXT"]).default("JSON"),
  // JSON: dot path such as "status" or "data.txn_status" or "result[0].status".
  // TEXT: ignored — the whole body is searched for the status words below.
  statusField: z.string().max(200).optional().default("status"),
  successValues: z.string().max(500).default("SUCCESS"),
  failureValues: z.string().max(500).default("FAILED,FAILURE"),
  pendingValues: z.string().max(500).optional().default("PENDING,ACCEPTED,PROCESSING"),
  // JSON: dot path. TEXT: a regex whose first group captures the value.
  opRefField: z.string().max(200).optional().default(""),
  vendorRefField: z.string().max(200).optional().default(""),
  messageField: z.string().max(200).optional().default(""),

  // Status check (used for PENDING transactions when no callback arrives)
  statusCheckMethod: z.enum(["GET", "POST"]).default("GET"),
  statusCheckUrl: z.string().max(2000).optional().default(""),
  statusCheckBodyTemplate: z.string().max(4000).optional().default(""),
  // Leave blank to reuse the recharge reply's field paths.
  statusCheckStatusField: z.string().max(200).optional().default(""),
  statusCheckOpRefField: z.string().max(200).optional().default(""),

  // Callback the vendor sends to us (query string or form/JSON body)
  callbackTxnIdParam: z.string().max(100).default("txnid"), // carries OUR transaction id
  callbackVendorRefParam: z.string().max(100).optional().default(""),
  callbackStatusParam: z.string().max(100).default("status"),
  callbackOpRefParam: z.string().max(100).optional().default("opref"),
  callbackMessageParam: z.string().max(100).optional().default(""),
  // Optional: only accept callbacks from these IPs (comma separated). Blank = any IP,
  // relying on the secret token in the callback URL.
  callbackAllowedIps: z.string().max(500).optional().default(""),
});

export type HttpConfig = z.infer<typeof httpConfigSchema>;

export function parseHttpConfig(raw: unknown): HttpConfig {
  return httpConfigSchema.parse(raw ?? {});
}
