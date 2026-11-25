import crypto from "crypto";
import { prisma } from "../config/prisma";
import { parseHttpConfig, type HttpConfig } from "./providerConfig";

export type ProviderStatus = "SUCCESS" | "FAILED" | "PENDING";

export interface ProviderResult {
  status: ProviderStatus;
  providerRefId: string | null; // operator reference ("Op Txn")
  vendorRefId: string | null; // the vendor's own transaction id
  message: string | null;
  rawResponse: Record<string, unknown>;
}

/**
 * Thrown only when the request provably never reached the vendor (connection refused,
 * DNS failure, bad URL). That is the one case where trying the next API is safe — any
 * other error might mean the vendor received it and the recharge may still go through,
 * so the transaction must stay PENDING instead of being sent elsewhere twice.
 */
export class ProviderDownError extends Error {}

export interface ProviderTarget {
  id: string;
  code: string;
  name: string;
  integrationType: string;
  httpConfig: unknown;
  apiKey: string;
  apiSecret: string;
  callbackToken: string | null;
}

export interface RechargeRequest {
  transactionId: string;
  mobile: string;
  amount: number;
  opcode: string; // vendor's operator code
}

export interface StatusCheckRequest {
  transactionId: string;
  vendorRefId: string | null;
  mobile: string;
  amount: number;
  createdAt: Date;
}

const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");

export function callbackUrlFor(provider: { code: string; callbackToken: string | null }) {
  if (!provider.callbackToken) return null;
  return `${PUBLIC_API_URL}/callback/provider/${encodeURIComponent(provider.code)}?token=${provider.callbackToken}`;
}

export function newCallbackToken() {
  return crypto.randomBytes(24).toString("hex");
}

// ---------------------------------------------------------------------------------------
// Templates

type TemplateMode = "url" | "form" | "json" | "raw";

function encodeFor(mode: TemplateMode, value: string) {
  if (mode === "url" || mode === "form") return encodeURIComponent(value);
  if (mode === "json") return JSON.stringify(value).slice(1, -1);
  return value;
}

export function renderTemplate(template: string, vars: Record<string, string>, mode: TemplateMode) {
  return template.replace(/\{([a-z_]+)\}/gi, (whole, key: string) => {
    const v = vars[key.toLowerCase()];
    return v === undefined ? whole : encodeFor(mode, v);
  });
}

function templateVars(provider: ProviderTarget, cfg: HttpConfig, extra: Record<string, string>) {
  return {
    apikey: provider.apiKey,
    apisecret: provider.apiSecret,
    memberid: cfg.memberId,
    callbackurl: callbackUrlFor(provider) ?? "",
    ...extra,
  };
}

/** Replaces credential values with *** before anything is written to the call log. */
function mask(text: string | null | undefined, provider: ProviderTarget, cfg: HttpConfig | null) {
  if (!text) return text ?? null;
  let out = text;
  for (const secret of [provider.apiKey, provider.apiSecret, cfg?.memberId, provider.callbackToken]) {
    if (secret && secret.length >= 3) {
      out = out.split(secret).join("***").split(encodeURIComponent(secret)).join("***");
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Reply parsing

/** Reads "data.txn.status" / "result[0].status" style paths out of parsed JSON. */
export function readPath(obj: unknown, path: string): unknown {
  if (!path) return undefined;
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    // Vendors are inconsistent about key case ("Status" vs "status").
    const rec = cur as Record<string, unknown>;
    const key = p in rec ? p : Object.keys(rec).find((k) => k.toLowerCase() === p.toLowerCase());
    cur = key === undefined ? undefined : rec[key];
  }
  return cur;
}

function list(csv: string | undefined) {
  return (csv ?? "")
    .split(",")
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);
}

/** Maps a vendor status value to ours. Anything unrecognised is PENDING — never guess success or failure. */
export function interpretStatusValue(value: unknown, cfg: HttpConfig): ProviderStatus | null {
  if (value === undefined || value === null || value === "") return null;
  const v = String(value).trim().toUpperCase();
  if (list(cfg.successValues).includes(v)) return "SUCCESS";
  if (list(cfg.failureValues).includes(v)) return "FAILED";
  if (list(cfg.pendingValues).includes(v)) return "PENDING";
  return null;
}

function findWord(body: string, words: string[]) {
  return words.some((w) => new RegExp(`(^|[^A-Z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Z0-9]|$)`).test(body));
}

function textStatus(body: string, cfg: HttpConfig): ProviderStatus | null {
  const upper = body.toUpperCase();
  // Failure words first: "UNSUCCESSFUL"-style replies must never read as success.
  if (findWord(upper, list(cfg.failureValues))) return "FAILED";
  if (findWord(upper, list(cfg.successValues))) return "SUCCESS";
  if (findWord(upper, list(cfg.pendingValues))) return "PENDING";
  return null;
}

function textField(body: string, pattern: string) {
  if (!pattern) return null;
  try {
    const m = new RegExp(pattern, "i").exec(body);
    return m?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

function str(v: unknown) {
  return v === undefined || v === null || v === "" ? null : String(v).trim();
}

export interface ParsedReply {
  status: ProviderStatus | null; // null = couldn't tell
  providerRefId: string | null;
  vendorRefId: string | null;
  message: string | null;
  json: unknown;
}

export function parseReply(
  body: string,
  cfg: HttpConfig,
  fields: { statusField: string; opRefField: string; vendorRefField: string; messageField: string }
): ParsedReply {
  let json: unknown = undefined;
  if (cfg.responseFormat === "JSON") {
    try {
      json = JSON.parse(body);
    } catch {
      json = undefined;
    }
  }
  if (json !== undefined) {
    return {
      status: interpretStatusValue(readPath(json, fields.statusField), cfg),
      providerRefId: str(readPath(json, fields.opRefField)),
      vendorRefId: str(readPath(json, fields.vendorRefField)),
      message: str(readPath(json, fields.messageField)),
      json,
    };
  }
  return {
    status: textStatus(body, cfg),
    providerRefId: textField(body, fields.opRefField),
    vendorRefId: textField(body, fields.vendorRefField),
    message: textField(body, fields.messageField) ?? (body.length <= 200 ? body.trim() : null),
    json: undefined,
  };
}

// ---------------------------------------------------------------------------------------
// HTTP

const DOWN_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "ERR_INVALID_URL"]);

function parseHeaders(text: string, vars: Record<string, string>) {
  const headers: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx > 0) headers[line.slice(0, idx).trim()] = renderTemplate(line.slice(idx + 1).trim(), vars, "raw");
  }
  return headers;
}

async function logCall(entry: {
  provider: ProviderTarget;
  cfg: HttpConfig | null;
  transactionId: string | null;
  kind: string;
  method?: string;
  url?: string;
  requestBody?: string | null;
  httpStatus?: number | null;
  responseBody?: string | null;
  parsedStatus?: string | null;
  durationMs?: number;
}) {
  await prisma.providerCallLog
    .create({
      data: {
        apiProviderId: entry.provider.id,
        transactionId: entry.transactionId,
        kind: entry.kind,
        method: entry.method,
        url: mask(entry.url, entry.provider, entry.cfg),
        requestBody: mask(entry.requestBody, entry.provider, entry.cfg)?.slice(0, 5000) ?? null,
        httpStatus: entry.httpStatus ?? null,
        responseBody: mask(entry.responseBody, entry.provider, entry.cfg)?.slice(0, 5000) ?? null,
        parsedStatus: entry.parsedStatus ?? null,
        durationMs: entry.durationMs,
      },
    })
    .catch((err) => console.error("provider call log failed", err));
}

interface HttpCallSpec {
  kind: "REQUEST" | "STATUS_CHECK";
  method: "GET" | "POST";
  urlTemplate: string;
  bodyTemplate: string;
  fields: { statusField: string; opRefField: string; vendorRefField: string; messageField: string };
}

async function httpCall(provider: ProviderTarget, cfg: HttpConfig, spec: HttpCallSpec, vars: Record<string, string>, transactionId: string) {
  if (!spec.urlTemplate.trim()) throw new ProviderDownError(`${provider.name}: no ${spec.kind === "REQUEST" ? "recharge" : "status check"} URL configured`);

  const url = renderTemplate(spec.urlTemplate.trim(), vars, "url");
  let body: string | undefined;
  const headers = parseHeaders(cfg.headers, vars);
  if (spec.method === "POST") {
    if (cfg.contentType === "JSON") {
      body = renderTemplate(spec.bodyTemplate, vars, "json");
      headers["Content-Type"] ??= "application/json";
    } else {
      body = renderTemplate(spec.bodyTemplate, vars, "form");
      headers["Content-Type"] ??= "application/x-www-form-urlencoded";
    }
  }

  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(url, { method: spec.method, headers, body, signal: AbortSignal.timeout(cfg.timeoutSeconds * 1000) });
  } catch (err) {
    const e = err as { name?: string; cause?: { code?: string }; code?: string; message?: string };
    const code = e.cause?.code ?? e.code ?? "";
    const durationMs = Date.now() - started;
    if (DOWN_CODES.has(code) || e.name === "TypeError" && /invalid url/i.test(e.message ?? "")) {
      await logCall({ provider, cfg, transactionId, kind: spec.kind, method: spec.method, url, requestBody: body, parsedStatus: "ERROR", responseBody: `Not reachable: ${code || e.message}`, durationMs });
      throw new ProviderDownError(`${provider.name} is unreachable (${code || e.message})`);
    }
    // Timed out or dropped after sending: the vendor may have it. Stay PENDING.
    const reason = e.name === "TimeoutError" || e.name === "AbortError" ? `No reply within ${cfg.timeoutSeconds}s` : `Connection error: ${code || e.message}`;
    await logCall({ provider, cfg, transactionId, kind: spec.kind, method: spec.method, url, requestBody: body, parsedStatus: "PENDING", responseBody: reason, durationMs });
    return { status: "PENDING" as const, providerRefId: null, vendorRefId: null, message: reason, rawResponse: { error: reason } };
  }

  const text = await response.text();
  const parsed = parseReply(text, cfg, spec.fields);
  let status: ProviderStatus;
  if (parsed.status) status = parsed.status;
  // A recharge request rejected with 4xx was never processed. (Not applied to status
  // checks: a 404 from a status endpoint says nothing reliable about the recharge.)
  else if (spec.kind === "REQUEST" && response.status >= 400 && response.status < 500) status = "FAILED";
  else status = "PENDING"; // 2xx with an unknown status word, or 5xx: can't be sure

  await logCall({
    provider,
    cfg,
    transactionId,
    kind: spec.kind,
    method: spec.method,
    url,
    requestBody: body,
    httpStatus: response.status,
    responseBody: text,
    parsedStatus: status,
    durationMs: Date.now() - started,
  });

  return {
    status,
    providerRefId: parsed.providerRefId,
    vendorRefId: parsed.vendorRefId,
    message: parsed.message,
    rawResponse: (parsed.json && typeof parsed.json === "object" ? (parsed.json as Record<string, unknown>) : { body: text.slice(0, 2000) }) as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------------------
// Mock vendor (dev/testing): ~10% unreachable, ~10% failed, ~15% pending that settles on
// a later status check. "0000000000" always fails, for deterministic refund testing.

async function mockRecharge(provider: ProviderTarget, req: RechargeRequest): Promise<ProviderResult> {
  await new Promise((r) => setTimeout(r, 150 + Math.random() * 250));
  if (Math.random() < 0.1) {
    await logCall({ provider, cfg: null, transactionId: req.transactionId, kind: "REQUEST", url: `mock://${provider.code}`, parsedStatus: "ERROR", responseBody: "Simulated: unreachable" });
    throw new ProviderDownError(`${provider.code} is unreachable`);
  }
  const roll = Math.random();
  const status: ProviderStatus = req.mobile === "0000000000" ? "FAILED" : roll < 0.1 ? "FAILED" : roll < 0.25 ? "PENDING" : "SUCCESS";
  const vendorRefId = `${provider.code}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const providerRefId = status === "SUCCESS" ? `OP${Math.floor(Math.random() * 1e10)}` : null;
  const rawResponse = { provider: provider.code, status, mobile: req.mobile, amount: req.amount, vendorRefId, opRef: providerRefId };
  await logCall({ provider, cfg: null, transactionId: req.transactionId, kind: "REQUEST", url: `mock://${provider.code}/recharge`, httpStatus: 200, responseBody: JSON.stringify(rawResponse), parsedStatus: status });
  return { status, providerRefId, vendorRefId, message: status === "FAILED" ? "Simulated failure" : null, rawResponse };
}

async function mockStatusCheck(provider: ProviderTarget, req: StatusCheckRequest): Promise<ProviderResult> {
  const ageSeconds = (Date.now() - req.createdAt.getTime()) / 1000;
  const status: ProviderStatus = ageSeconds < 20 ? "PENDING" : Math.random() < 0.85 ? "SUCCESS" : "FAILED";
  const providerRefId = status === "SUCCESS" ? `OP${Math.floor(Math.random() * 1e10)}` : null;
  const rawResponse = { provider: provider.code, status, vendorRefId: req.vendorRefId, opRef: providerRefId };
  await logCall({ provider, cfg: null, transactionId: req.transactionId, kind: "STATUS_CHECK", url: `mock://${provider.code}/status`, httpStatus: 200, responseBody: JSON.stringify(rawResponse), parsedStatus: status });
  return { status, providerRefId, vendorRefId: req.vendorRefId, message: null, rawResponse };
}

// ---------------------------------------------------------------------------------------
// Public API

export async function sendRecharge(provider: ProviderTarget, req: RechargeRequest): Promise<ProviderResult> {
  if (provider.integrationType !== "HTTP") return mockRecharge(provider, req);
  const cfg = parseHttpConfig(provider.httpConfig);
  const vars = templateVars(provider, cfg, {
    mobile: req.mobile,
    number: req.mobile,
    amount: String(req.amount),
    opcode: req.opcode,
    txnid: req.transactionId,
    vendorref: "",
  });
  return httpCall(
    provider,
    cfg,
    {
      kind: "REQUEST",
      method: cfg.method,
      urlTemplate: cfg.url,
      bodyTemplate: cfg.bodyTemplate,
      fields: { statusField: cfg.statusField, opRefField: cfg.opRefField, vendorRefField: cfg.vendorRefField, messageField: cfg.messageField },
    },
    vars,
    req.transactionId
  );
}

/** Asks the vendor for a pending transaction's outcome. Returns null if this vendor has no status-check URL. */
export async function checkStatus(provider: ProviderTarget, req: StatusCheckRequest): Promise<ProviderResult | null> {
  if (provider.integrationType !== "HTTP") return mockStatusCheck(provider, req);
  const cfg = parseHttpConfig(provider.httpConfig);
  if (!cfg.statusCheckUrl.trim()) return null;
  const vars = templateVars(provider, cfg, {
    mobile: req.mobile,
    number: req.mobile,
    amount: String(req.amount),
    txnid: req.transactionId,
    vendorref: req.vendorRefId ?? "",
    opcode: "",
  });
  try {
    return await httpCall(
      provider,
      cfg,
      {
        kind: "STATUS_CHECK",
        method: cfg.statusCheckMethod,
        urlTemplate: cfg.statusCheckUrl,
        bodyTemplate: cfg.statusCheckBodyTemplate,
        fields: {
          statusField: cfg.statusCheckStatusField || cfg.statusField,
          opRefField: cfg.statusCheckOpRefField || cfg.opRefField,
          vendorRefField: cfg.vendorRefField,
          messageField: cfg.messageField,
        },
      },
      vars,
      req.transactionId
    );
  } catch (err) {
    // An unreachable status-check endpoint tells us nothing about the transaction itself.
    if (err instanceof ProviderDownError) return { status: "PENDING", providerRefId: null, vendorRefId: null, message: err.message, rawResponse: { error: err.message } };
    throw err;
  }
}

export { logCall as logProviderCall };
