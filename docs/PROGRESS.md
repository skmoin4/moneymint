# MoneyMint — progress log

Newest first. One entry per piece of work: what was built, decisions, how it was tested,
and what the owner must do. Update together with "Current status" in `CLAUDE.md`.

---

## 2026-11-26 — Handover package for the Flutter developer — done

- `docs/app-api/APP_INTEGRATION.md`: conventions (money as decimal strings, headers, errors
  table — only 401 logs out), app start (version gate), OTP/password login, PIN, recharge
  with PENDING handling, bills, DMT, wallet + Razorpay code, QR, balance requests, other
  screens, not-yet-available features, release checklist.
- `docs/app-api/openapi.yaml`: 56 operations with operationIds (lint-clean with Redocly);
  `MoneyMint-App.postman_collection.json` generated from it (token auto-saved after login,
  `X-Client-Source: APP` added automatically).
- `backend/scripts/contract-test.mjs` (`npm run test:contract`): calls the app endpoints and
  validates responses against the spec — 47/47 pass.
- Found while documenting and fixed: app payments had no idempotency → optional `clientRef` on
  `/recharge`, `/bbps/pay`, `/dmt/transfer` (repeat → original transaction, 200 `duplicate`);
  test servers had no way to get an OTP → `DEV_FIXED_OTP` (ignored when NODE_ENV=production).
  Reference app now sends clientRef.
- Tested: 3 concurrent bill payments with one clientRef → 1 transaction; fixed OTP login.

## 2026-11-26 — Handover package (in progress): missing app APIs + PIN hardening

- New app APIs: `GET /app/config` (public: min/latest app version, update URL, maintenance
  message, support contacts — set from admin Settings), `POST/DELETE /app/devices` (FCM tokens,
  `DeviceToken` table; sending pushes still needs Firebase credentials), `PATCH /auth/me`
  (email). `GET /auth/me` now also returns `email` and `kycStatus`.
- PIN fixes found while documenting: a wrong PIN returned 401 (clients treat 401 as "logged
  out") → now 400 `PIN_INCORRECT`; 5 wrong PINs lock PIN actions for 15 min (423 `PIN_LOCKED`);
  changing/disabling an existing PIN needs the current PIN; forgot PIN = `POST /auth/pin/reset-request`
  + `POST /auth/pin/reset {otp,newPin}`. PIN errors carry a `code`. Reference app PIN screen updated.
- Tested: config/devices/profile endpoints; full PIN flow (required, 4 wrong → lock on 5th,
  lock blocks correct PIN, session stays valid, OTP reset, change with current PIN, disable).
- Remaining for the package: OpenAPI spec, Postman collection, integration guide.

## 2026-11-25 — Session notes set up; app ownership decided

- Owner: a separate Flutter developer will build the mobile app; we provide APIs and handle
  everything else. `app/` stays in the repo as a reference/starter for that developer.
- Added `CLAUDE.md` (session hand-off) and this log. Moved the test stand-ins out of the
  scratchpad into the repo: `backend/scripts/fake-razorpay.mjs`, `backend/scripts/demo-data.mjs`.
- Next agreed: API handover package for the Flutter developer, then Step 6, then Step 7.

## 2026-11-25 — Step 5: Flutter reference app (`app/`) — partial

- Flutter 3.47.9 (downloaded to `/opt/flutter`; not persistent). Packages: http, provider,
  flutter_secure_storage, razorpay_flutter.
- Screens: OTP login (+ password), home (balance, news, services, recent), recharge with
  operator auto-detect + plans sheet + PIN, result screen polling PENDING, bill payment,
  DMT, history (filters, complaint), wallet (Razorpay on Android/iOS, test-mode pay with the
  mock gateway, UPI QR, statement), profile (commission, balance request, complaints, PIN,
  logout all devices), notifications.
- `API_URL` via `--dart-define`; `FORCE_SEMANTICS=true` makes the web build testable with Playwright.
- Backend seed now adds sample plans (JIO/AIRTEL/VI/BSNL) and number series (dev only).
- Tested: `flutter analyze` clean, 4 unit tests pass, web build runs; OTP login verified in
  the browser. Not done: full end-to-end UI run, Android APK (needs Android SDK).
- Testing tip: in Flutter web, wait ~400 ms after focusing a field before typing, or the first
  character is lost.

## 2026-11-25 — Step 4: Partner API for API users (B2B)

- `/api/v1` (GET or POST): balance, operators, recharge, bill fetch/pay, status. Auth = API token
  (`X-Api-Token`, stored as SHA-256 hash, shown once) **and** whitelisted server IP. 300 req/min per token.
- `client_ref` unique per user (DB constraint) → retries/concurrent duplicates return the original
  transaction (`duplicate: true`).
- Outcome callbacks (SUCCESS/FAILED/REFUNDED) queued in the settlement transaction, HMAC-signed
  (`X-MoneyMint-Signature`, POST JSON or GET), retried after 1/5/15/60/180 min, re-sendable.
  SSRF guard on callback URLs (`ALLOW_PRIVATE_CALLBACKS=true` for local tests only).
- Panel: API Users (admin), API Token & Callback, API Document (auto-filled base URL, samples).
  Login returns `user.apiEnabled` (menus shown only to API users). Dashboard: API Outlet Main.
- `TRUST_PROXY` env needed behind a load balancer, or the IP whitelist sees the proxy IP.
- Tested end to end with a local partner server: auth failures, success/failed/pending→success,
  duplicate and 5 concurrent same client_ref (1 transaction), signed callbacks, retry after a
  500 then resend, SSRF blocks (localhost, 10.x, 169.254.169.254, ::1). Ledger invariant held.

## 2026-11-25 — Step 3: Wallet load

- Gateway abstraction (`services/payments/`): Razorpay (orders, checkout signature + payment
  lookup, raw-body signed webhooks payment.captured / payment.failed / qr_code.credited) and a
  dev mock. Online top-up disabled unless Razorpay keys or `ENABLE_MOCK_PAYMENTS=true`.
- Per-user multi-use UPI QR with auto-credit. Method-wise charges (`gatewayCharges` JSON setting),
  `qrChargePercent`, `topupMin`/`topupMax`; charge is a separate GATEWAY_CHARGE ledger line.
- Balance requests: one UTR per pending/approved request; deposit account/mode/date; atomic
  approval; **the approving distributor's wallet is now debited** (before, balance was created
  from nothing); root admin approval creates money. Managers own bank accounts (`ownerId`).
- Admin "Main Payment Summary" (Gateway / Static QR / Bank & Direct) + charge settings; "Add Money" page.
- Tested against the fake Razorpay: UPI ₹500 (verify then webhook — credited once), card ₹1000
  (−1.8% = ₹982), forged signatures rejected, amount mismatch flagged not credited, QR ₹250
  (−0.5%), duplicate webhooks ignored; balance requests (dup UTR, approver debit, insufficient
  balance, root approval). Ledger invariant held.
- Owner to do: Razorpay account (needs company + GST), enable QR Codes, set
  `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET`, add webhook URL `/wallet/add-money/webhook`.

## 2026-11-25 — Step 2: Commission chain

- Differential model: user earns own pack rate; each Distributor/MD earns own rate − best rate
  below (never negative); platform keeps vendor margin + surcharge − payouts.
- Slabs per operator with amount ranges, COMMISSION or SURCHARGE, % or flat; overlap rejected;
  bulk set by operator type; clone pack. TDS setting `commissionTdsPercent`. Payouts in `CommissionPayout`.
- Vendor margin per operator↔API mapping; vendor float debited amount − margin. Refund reverses chain.
- Panel: Commission Packs, Commission Distribution report (with platform net margin), My Commission,
  vendor margin column, commission breakdown in the Action dialog.
- Tested: Jio ₹300 → retailer ₹6 (₹5.70 after 5% TDS), distributor ₹1.50, MD ₹0.90, vendor float
  −₹290.40; refund fully reversed; DMT ₹2000 → ₹20 surcharge, distributor ₹4, MD ₹2, platform ₹14.
- Owner to do: confirm TDS rate and GST treatment of surcharge with a CA.

## 2026-11-25 — Step 1: Vendor-ready recharge engine + security

- Vendors configurable without code (MOCK or HTTP: URL/body templates, reply field paths, status
  words, status-check URL, callback params, per-operator vendor codes) — "API Parsing Setting".
- Replies SUCCESS/FAILED/PENDING; PENDING settled by vendor callback (`/callback/provider/:code?token=`),
  background status poller, admin "Check Status", or app polling `/recharge/status/:id`.
- Failover only when the vendor never got the request; optional `failoverOnFailure`; atomic settlement.
- Call logs per transaction/provider (credentials masked). AEPS refund/float bugs fixed.
- Security: mock-pay gated by `ENABLE_MOCK_PAYMENTS`; no default webhook secret; JWT_SECRET required;
  suspended/inactive users blocked (login + live sessions) with status control in Users page;
  strict rate limit only on login/OTP routes; provider keys never returned.
- Tested with `scripts/fake-vendor.ts`: all five outcome paths, poller auto-settle, 5 parallel status
  checks settle once, forged callback rejected.

## 2026-11-25 — Admin panel redesign + Transaction History / Pendings

- Classic portal look (dark sidebar, teal actions, News ticker, dense status-tinted tables) across
  all pages; Dashboard, Transaction History (full filters, S/F/P/R totals, bulk action, send to API,
  CSV), Pendings (auto-refresh), Provider API Setting.
- Backend: `/admin/transactions` (+ export, action, bulk, send-to-api), refund of SUCCESS
  transactions, `Transaction.source`, provider keys removed from transaction/operator responses.

## Before this session

- Initial backend (wallet/ledger engine, recharge/BBPS/DMT/AEPS, OTP login, cashback, referrals),
  admin panel and `LAUNCH_CHECKLIST.md` were already in the repo (commit f4b3afb).
