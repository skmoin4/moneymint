/**
 * Creates a demo hierarchy on a FRESH local database (development only):
 *   Admin 9000000001 / admin123 → Master Distributor 9000000002 → Distributor 9000000003
 *   → Retailers 9000000011..14 (password pass1234), funds them and runs some recharges.
 * Prerequisites: `npx prisma migrate deploy && npx tsx prisma/seed.ts`, backend running on :4000.
 *   node scripts/demo-data.mjs
 * Note: /auth/register only works while no admin exists, and the login rate limit
 * (10 / 15 min per IP) resets when the backend restarts.
 */
const B = "http://localhost:4000";
async function call(method, path, body, token) {
  const r = await fetch(B + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), "X-Client-Source": Math.random() < 0.5 ? "WEB" : "APP" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  if (!r.ok) console.log("ERR", method, path, r.status, t.slice(0, 200));
  return j;
}
const admin = await call("POST", "/auth/register", { name: "MoneyMint Admin", phone: "9000000001", password: "admin123" });
const A = admin.token;
await call("POST", "/wallet/self-fund", { amount: 1000000, paymentInfo: "Opening float", reference: "OPEN-1" }, A);
const mk = async (name, phone, role, token) => (await call("POST", "/users", { name, phone, password: "pass1234", role }, token));
await mk("Demo Master Dist", "9000000002", "MASTER_DISTRIBUTOR", A);
const md = (await call("POST", "/auth/login", { phone: "9000000002", password: "pass1234" })).token;
await mk("Demo Distributor", "9000000003", "DISTRIBUTOR", md);
const dist = (await call("POST", "/auth/login", { phone: "9000000003", password: "pass1234" })).token;
const users = await call("GET", "/users", null, A);
const mdId = users.users.find(u => u.phone === "9000000002").id;
await call("POST", "/wallet/transfer", { toUserId: mdId, amount: 300000, paymentMode: "NEFT" }, A);
const distId = (await call("GET", "/users", null, md)).users.find(u => u.phone === "9000000003").id;
await call("POST", "/wallet/transfer", { toUserId: distId, amount: 200000, paymentMode: "NEFT" }, md);
const retailers = [["Shree Mobile Point", "9000000011"], ["Sai Recharge Centre", "9000000012"], ["Om Telecom", "9000000013"], ["City Digital Seva", "9000000014"]];
const rtokens = [];
for (const [n, p] of retailers) {
  await mk(n, p, "RETAILER", dist);
  const id = (await call("GET", "/users", null, dist)).users.find(u => u.phone === p).id;
  await call("POST", "/wallet/transfer", { toUserId: id, amount: 25000, paymentMode: "UPI" }, dist);
  rtokens.push((await call("POST", "/auth/login", { phone: p, password: "pass1234" })).token);
}
const ops = ["JIO", "AIRTEL", "VI", "BSNL", "TATAPLAY"];
const amts = [19, 29, 149, 199, 239, 299, 349, 666, 719];
let n = 0;
for (let round = 0; round < 12; round++) {
  await Promise.all(rtokens.map(async (t) => {
    const num = "9" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
    await call("POST", "/recharge", { operatorCode: ops[Math.floor(Math.random() * ops.length)], mobileNumber: round === 3 ? "0000000000" : num, amount: amts[Math.floor(Math.random() * amts.length)] }, t);
    n++;
  }));
}
await Promise.all(rtokens.slice(0, 2).map(t => call("POST", "/bbps/pay", { operatorCode: "MSEB", consumerNumber: "0" + String(Math.floor(Math.random() * 1e11)), amount: 1450 }, t)));
console.log("recharges", n);
