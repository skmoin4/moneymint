# MoneyMint — notes for every session

Read this first. It is the hand-off between sessions: what the project is, how to run it,
the rules that keep money correct, and where the work stands. **Keep it current**: after
finishing any piece of work, update "Current status" below and add an entry to
`docs/PROGRESS.md`, in the same commit as the work.

## The project

B2B recharge / fintech platform for India, built to match the feature level of portals
like AP Money (feature parity only — never copy their name, logo or branding).
Hierarchy: **Admin → Master Distributor → Distributor → Retailer**, plus **API users**
(B2B partners calling our API). Services: mobile/DTH/FASTag/OTT recharge, BBPS bill
payment, DMT money transfer, AEPS. Wallet per user; every rupee movement is in a ledger.

- `backend/` — Node + Express 5 + TypeScript, Prisma 7 (driver adapter `@prisma/adapter-pg`), PostgreSQL.
- `admin/` — React 19 + Vite + Tailwind 4 admin/web panel (all roles log in here).
- `app/` — Flutter reference app (see "Mobile app" below).
- `backend/API.md` — API reference (all endpoints). `LAUNCH_CHECKLIST.md` — vendors/licences still needed.
- `docs/PROGRESS.md` — dated log of everything built, decisions, and test results.

## Working with the owner

- The owner writes in Hinglish; reply in Hinglish (Roman script), short and plain.
- They work **step by step**: propose the next step, wait for "shuru karo", then build,
  test end to end, commit, push, and report in plain words (what changed, what was tested,
  what they must do).
- Develop on the session's assigned branch (so far `claude/compassionate-planck-nmcm1n`);
  commit and push when a step is done. No pull requests unless asked.

## Running locally

```bash
service postgresql start          # the container's Postgres stops when idle — restart it
cd backend && npm ci
cp .env.example .env              # then set DATABASE_URL, JWT_SECRET (16+ chars), ENABLE_MOCK_PAYMENTS=true
npx prisma migrate deploy && npx tsx prisma/seed.ts
npx tsx src/index.ts              # API on :4000 (no watch; restart after backend edits)
node scripts/demo-data.mjs        # optional: demo users + transactions on a fresh DB
cd ../admin && npm ci && echo "VITE_API_URL=http://localhost:4000" > .env.local && npx vite   # panel on :5173
```

Local DB used so far: `postgresql://postgres:postgres@localhost:5432/moneymint`
(`ALTER USER postgres PASSWORD 'postgres'; CREATE DATABASE moneymint;`).
Demo logins (only after `demo-data.mjs`): admin `9000000001`/`admin123`, MD `9000000002`,
Distributor `9000000003`, retailers `9000000011`–`14`, all `pass1234`.

Checks before committing: `cd backend && npx tsc --noEmit` (+ `npm run test:contract` if an app API changed); `cd admin && npx tsc -b && npx oxlint && npx vite build`
(oxlint has 4 known pre-existing warnings).

Gotchas:
- Login/OTP routes are rate limited (10 per 15 min per IP, in memory) — restart the backend when testing hits it.
- CORS: `CORS_ORIGIN` in `backend/.env` must list the panel origin (`http://localhost:5173`; use `localhost`, not `127.0.0.1`).
- OTPs/SMS are not sent anywhere yet — read them from the `SmsLog` table.
- Playwright + Chromium are preinstalled for UI checks (screenshots of the panel).

## Database & migrations

- Schema: `backend/prisma/schema.prisma`. The generated client is **committed** in
  `backend/src/generated/prisma` — run `npx prisma generate` after every schema change.
- `prisma migrate dev` is interactive and fails here. Create migrations like this:
  ```bash
  D=prisma/migrations/$(date +%Y%m%d%H%M%S)_name && mkdir -p $D
  npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > $D/migration.sql
  npx prisma migrate deploy && npx prisma generate
  ```
  Read the SQL before applying. Never edit an applied migration.

## Rules that keep money correct (do not break)

1. Every wallet balance change writes a `LedgerEntry` in the same DB transaction. Invariant:
   `SELECT (SELECT sum(CASE WHEN type='CREDIT' THEN amount ELSE -amount END) FROM "LedgerEntry"), (SELECT sum(balance) FROM "Wallet");`
   — the two numbers must be equal. Check it after any money-related change.
2. Debit-then-check: decrement the wallet, then throw if the balance went negative (rolls back).
3. Settlement claims a transaction atomically (`updateMany where status='PENDING'`), so a
   provider reply, vendor callback, status check and admin action can never settle twice.
   Same pattern for payment orders and balance-request approval.
4. A vendor that may have received a request never gets it re-sent elsewhere: failover only
   on `ProviderDownError` (provably not delivered); timeouts/unknown replies stay PENDING.
5. Refunds reverse everything from the ledger (commission chain, cashback, referral, vendor float).
6. Money credited from outside (gateway, QR) only after the gateway confirms (signed webhook,
   or checkout signature + payment lookup) — never because a client says it paid.
7. Vendor `apiKey`/`apiSecret` never leave the server: embed providers with
   `PROVIDER_PUBLIC_SELECT` / `PROVIDER_ADMIN_SELECT` (`src/utils/providerSelect.ts`).
8. Partner callbacks are queued inside the settlement transaction (`enqueuePartnerCallback`).
9. User-supplied URLs our server fetches go through `assertPublicHttpUrl` (SSRF guard).

## Key code map (backend/src)

- `services/transactionEngine.ts` — recharge/BBPS/DMT pipeline: debit (+surcharge), dispatch to
  API 1→5, `applyProviderResult`, `settleTransaction`, refunds, status checks, send-to-API.
- `services/providerClient.ts` + `providerConfig.ts` — vendor integration: MOCK simulator or HTTP
  vendor described by config ("API Parsing Setting"); call logs in `ProviderCallLog`.
- `routes/providerCallback.ts` — vendor callbacks; `services/statusPoller.ts` — auto status checks.
- `services/commission.ts` — differential commission chain, slabs, vendor margin, TDS.
- `services/payments/` — gateway interface, Razorpay, mock, top-up settlement.
- `routes/partnerApi.ts` (`/api/v1`), `routes/apiAccess.ts`, `services/partnerCallbacks.ts` — API users.
- `routes/adminTransactions.ts` — Transaction History / Pendings (filters, bulk action, send to API).
- Test stand-ins: `scripts/fake-vendor.ts` (recharge vendor), `scripts/fake-razorpay.mjs`.

Admin panel: theme tokens in `admin/src/index.css`; shared UI in `admin/src/components/ui`;
sidebar menu (with roles) in `admin/src/components/Layout.tsx`; transaction table/modals in
`admin/src/components/txn`.

## Mobile app

A separate Flutter developer will build the production app against our APIs. `app/` is a
working Flutter reference/starter (OTP login, recharge with plans, pending polling, bills,
DMT, wallet with Razorpay + UPI QR, history, profile) — kept on the owner's go-ahead as an
example for that developer. Our job: give that developer complete API docs and keep the APIs
stable. Flutter SDK is not preinstalled in the container (last time: 3.47.9 extracted to
`/opt/flutter`, run with `export PATH=/opt/flutter/bin:$PATH`).

## Current status (update this)

Done (steps 1–4, plus admin redesign):
- Admin panel redesigned in classic portal style; Dashboard, Transaction History, Pendings,
  Provider API Setting, API Parsing Setting, Commission, Payment Summary, API Users pages.
- Step 1 — vendor-ready recharge engine (configurable HTTP vendors, PENDING/callback/status check, logs) + security fixes.
- Step 2 — commission chain (MD/Distributor/Retailer), surcharge, vendor margin, TDS, reports.
- Step 3 — wallet load: Razorpay checkout + webhooks, per-user UPI QR, balance requests fixed.
- Step 4 — partner API for API users (token + IP, idempotent client_ref, signed callbacks, docs page).
- Handover package for the external Flutter developer: `docs/app-api/` (guide, OpenAPI spec
  contract-tested against the server, Postman); new app APIs (`/app/config`, `/app/devices`,
  `PATCH /auth/me`), `clientRef` idempotency on app payments, PIN lockout/reset, `DEV_FIXED_OTP`.
- Step 5 — `app/` Flutter reference app (analyze clean, unit tests pass; end-to-end UI run and
  APK build were not finished — the owner then decided an external developer builds the app).

Next (agreed order):
1. ~~API handover package~~ — DONE (`docs/app-api/`: APP_INTEGRATION.md, openapi.yaml,
   Postman collection). **Whenever an app-facing API changes, update `openapi.yaml` and run
   `cd backend && npm run test:contract` (needs demo data + backend on :4000).**
2. Step 6 — remaining reports (Account Summary, Activation report, etc.), admin complaints
   workflow, real SMS (DLT).
3. Step 7 — production: hosting, backups, monitoring, deployment.

Known limitations / open items:
- Nothing is connected to a real vendor, gateway or SMS provider yet (see `LAUNCH_CHECKLIST.md`).
- KYC stores Aadhaar/PAN as typed (no verification, no masking) — must change before launch.
- DNS-rebinding window in the SSRF guard (resolve-then-fetch) is not closed.
- Some admin routes have no frontend role guard (backend still enforces roles).
