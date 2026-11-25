/**
 * Contract test: calls the app-facing endpoints on a running backend and validates every
 * response against docs/app-api/openapi.yaml. Run after changing any app API, and update
 * the spec in the same commit.
 *
 * Needs: backend on :4000 with mock payments, demo data (scripts/demo-data.mjs) so that
 * retailer 9000000011 / pass1234 exists. Creates a few test transactions.
 *   npm run test:contract
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import Ajv2020 from "ajv/dist/2020.js";
const spec = yaml.load(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../docs/app-api/openapi.yaml"), "utf8"));
const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
ajv.addSchema(spec, "spec");
const esc = (s) => s.replace(/~/g, "~0").replace(/\//g, "~1");
function schemaPointer(path, method, status) {
  let base = `/paths/${esc(path)}/${method}/responses/${status}`;
  let resp = spec.paths[path][method].responses[String(status)];
  if (!resp) return null;
  if (resp.$ref) { base = resp.$ref.slice(1); resp = resp.$ref.slice(2).split("/").reduce((o, k) => o[k], spec); }
  if (!resp.content) return "none";
  return `${base}/content/${esc("application/json")}/schema`;
}
const B = process.env.API_URL || "http://localhost:4000";
const call = async (m, p, b, t) => { const r = await fetch(B + p, { method: m, headers: { "Content-Type": "application/json", "X-Client-Source": "APP", ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json() }; };
let pass = 0, fail = 0;
async function check(method, specPath, url, body, token, expectStatus) {
  const r = await call(method.toUpperCase(), url, body, token);
  const ptr = schemaPointer(specPath, method, r.status);
  const label = `${method.toUpperCase()} ${url.split("?")[0]} → ${r.status}`;
  if (expectStatus && r.status !== expectStatus) { fail++; console.log("✗", label, "expected", expectStatus, JSON.stringify(r.body).slice(0, 150)); return r; }
  if (!ptr) { fail++; console.log("✗", label, "status not documented"); return r; }
  if (ptr === "none") { pass++; return r; }
  const v = ajv.getSchema("spec#" + ptr);
  if (v(r.body)) { pass++; } else { fail++; console.log("✗", label, JSON.stringify(v.errors.slice(0, 3))); }
  return r;
}
const login = await check("post", "/auth/login", "/auth/login", { phone: "9000000011", password: "pass1234" }, null, 200);
const T = login.body.token;
for (const [p, u] of [["/auth/me","/auth/me"],["/auth/pin/status","/auth/pin/status"],["/auth/login-history","/auth/login-history"],["/app/config","/app/config"],["/wallet/balance","/wallet/balance"],["/wallet/ledger","/wallet/ledger?pageSize=50"],["/wallet/cashback-summary","/wallet/cashback-summary"],["/wallet/add-money/config","/wallet/add-money/config"],["/wallet/add-money/history","/wallet/add-money/history"],["/wallet/add-money/qr","/wallet/add-money/qr"],["/operators","/operators?activeOnly=1"],["/operators/detect","/operators/detect?mobileNumber=7012345678"],["/operators/detect","/operators/detect?mobileNumber=1"],["/plans","/plans?operatorCode=JIO"],["/recharge/history","/recharge/history?pageSize=100"],["/dmt/remitters","/dmt/remitters"],["/dmt/remitters/search","/dmt/remitters/search?mobileNumber=9833333333"],["/dmt/remitters/search","/dmt/remitters/search?mobileNumber=9000000000"],["/kyc/me","/kyc/me"],["/complaints","/complaints"],["/bank-accounts","/bank-accounts"],["/payment-modes","/payment-modes"],["/balance-requests","/balance-requests"],["/users/my-commission","/users/my-commission"],["/users/my-referrals","/users/my-referrals"],["/notices/active","/notices/active"],["/broadcast/my-notifications","/broadcast/my-notifications"]])
  await check("get", p, u, null, T, 200);
const rem = (await call("GET", "/dmt/remitters", null, T)).body.remitters[0];
if (rem) await check("get", "/dmt/remitters/{id}/beneficiaries", `/dmt/remitters/${rem.id}/beneficiaries`, null, T, 200);
const ref = `ct-${Date.now()}`;
const rc = await check("post", "/recharge", "/recharge", { operatorCode: "JIO", mobileNumber: "7012345670", amount: 199, clientRef: ref }, T, 201);
const dup = await check("post", "/recharge", "/recharge", { operatorCode: "JIO", mobileNumber: "7012345670", amount: 199, clientRef: ref }, T, 200);
if (dup.body.transaction?.id !== rc.body.transaction.id || dup.body.duplicate !== true) { fail++; console.log("✗ duplicate clientRef did not return the original transaction"); } else pass++;
await check("get", "/recharge/status/{id}", `/recharge/status/${rc.body.transaction.id}`, null, T, 200);
await check("post", "/recharge", "/recharge", { operatorCode: "JIO", mobileNumber: "12", amount: -1 }, T, 400);
await check("post", "/recharge", "/recharge", { operatorCode: "JIO", mobileNumber: "7012345670", amount: 99999999 }, T, 400);
await check("post", "/bbps/fetch-bill", "/bbps/fetch-bill", { operatorCode: "MSEB", consumerNumber: "012345678901" }, T, 200);
await check("post", "/bbps/pay", "/bbps/pay", { operatorCode: "MSEB", consumerNumber: "012345678901", amount: 500 }, T, 201);
const ord = await check("post", "/wallet/add-money/order", "/wallet/add-money/order", { amount: 100 }, T, 201);
await check("post", "/wallet/add-money/mock-pay", "/wallet/add-money/mock-pay", { gatewayOrderId: ord.body.checkout.orderId, method: "upi" }, T, 200);
await check("post", "/wallet/add-money/order", "/wallet/add-money/order", { amount: 1 }, T, 400);
await check("post", "/complaints", "/complaints", { subject: "Test issue", description: "Contract test complaint", transactionRef: rc.body.transaction.id }, T, 201);
await check("post", "/app/devices", "/app/devices", { token: "contract-test-token-123", platform: "android", appVersion: "1.0.0" }, T, 200);
await check("delete", "/app/devices", "/app/devices", { token: "contract-test-token-123" }, T, 200);
await check("patch", "/auth/me", "/auth/me", { email: null }, T, 200);
await check("post", "/broadcast/my-notifications/mark-read", "/broadcast/my-notifications/mark-read", {}, T, 200);
await check("get", "/auth/me", "/auth/me", null, "bad.token.value", 401);
await check("post", "/auth/otp/request", "/auth/otp/request", { phone: "9999999990" }, null, 404);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
