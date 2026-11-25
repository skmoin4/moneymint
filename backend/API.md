# MoneyMint API Reference

This is the REST API that powers both the admin web panel and the retailer/consumer
mobile app (built separately). Every endpoint below works identically for any client —
there is no separate "app API" and "web API": one backend, one contract.

## How this system actually works

MoneyMint has two front ends talking to **one shared backend**:

1. **The app** — this is where the real business happens. Retailers (and eventually
   end customers) log in from their phone and do the actual recharges, bill payments,
   DMT transfers, and AEPS withdrawals. This is the primary, high-volume traffic source.
2. **The admin web panel** — used by ADMIN / MASTER_DISTRIBUTOR / DISTRIBUTOR to manage
   the platform: configure providers, set commissions, review KYC/complaints, run
   reports. It does not replace the app — it manages what flows in from it.

Every transaction created by the app shows up immediately in the admin panel's
reports, ledger, and dashboard, because both are reading and writing the same
database through the same API. There is nothing app-specific to build on the backend
beyond what's documented here — a Flutter client just needs to call these endpoints.

## Base URL

- Dev: `http://localhost:4000`
- Set via `CORS_ORIGIN` / deployment config in production.

**CORS note for the Flutter dev:** the `cors` middleware only affects browser
requests (it reacts to the `Origin` header, which native HTTP clients like Dio or
`http` don't send). A Flutter app talking to this API is never blocked by CORS —
nothing to configure on the client side for that.

## Auth

All endpoints except `POST /auth/login`, `POST /auth/register` (bootstrap-only, not
for app use), and `GET /health` require:

```
Authorization: Bearer <token>
```

### `POST /auth/login`
```json
// request
{ "phone": "8888888888", "password": "retailer123" }

// response 200
{
  "token": "eyJ...",
  "user": { "id": "uuid", "name": "Test Retailer", "phone": "8888888888", "role": "RETAILER" }
}
```
Token is a JWT valid for `JWT_EXPIRES_IN` (default 7 days). Store it and send it on
every subsequent request.

Login failures return `401 { "error": "Invalid phone or password" }`. Repeated
failures are rate-limited (10 attempts / 15 min per IP).

**IP Whitelist only ever applies to ADMIN logins.** If the admin enables an IP
whitelist (Security → IP Whitelist in the panel), it restricts the admin web panel
to specific office IPs — it never blocks retailer/app logins, which come from cell
networks nationwide.

### OTP login (the app's primary login channel)

Mobile number + OTP, no password — this is what the consumer app should use instead
of `/auth/login`. Issues the same kind of session token as password login; both are
just two ways to authenticate the same account.

**`POST /auth/otp/request`**
```json
// request
{ "phone": "9812345678" }
// response 200
{ "sent": true, "expiresInSeconds": 300 }
```
`404` if the phone isn't a registered account (the app never lets an unknown number
self-register — accounts are created by an admin/distributor via `POST /users`).
`429` if requested again within 45 seconds of the last request. OTP is 6 digits,
valid 5 minutes, max 5 verify attempts.

**`POST /auth/otp/verify`**
```json
// request
{ "phone": "9812345678", "otp": "482913" }
// response 200 — identical shape to /auth/login
{ "token": "eyJ...", "user": { "id": "uuid", "name": "...", "phone": "...", "role": "RETAILER" } }
```
`401` on wrong/expired OTP or unknown phone (same generic message either way, to
avoid leaking which phones are registered).

### Transaction PIN (optional second factor on money movement)

A user can opt into a 4-6 digit PIN that's required on every money-movement call
(recharge, BBPS pay, DMT transfer, AEPS withdrawal, wallet transfer) — but NOT on
read-only calls like balance/history. If `pinEnabled` is false (the default), these
endpoints work exactly as documented below with no `pin` field needed.

- `GET /auth/pin/status` → `{ "hasPin": boolean, "pinEnabled": boolean }`
- `POST /auth/pin/set` — `{ "pin": "1234" }` (4-6 digits) — sets/replaces the PIN, does not enable it by itself
- `POST /auth/pin/toggle` — `{ "enabled": true }` — `400` if enabling without a PIN set first

Once `pinEnabled` is true, every money-movement request must include `"pin"` in its
JSON body alongside its normal fields, e.g. `POST /recharge { "operatorCode", "mobileNumber", "amount", "pin": "1234" }`.
Wrong PIN → `401`.

### Forgot password

Same OTP mechanics as login, under a separate `purpose` so a password-reset code
can't be replayed to log in (or vice versa).

- `POST /auth/password/reset-request` — `{ "phone" }` → `{ "sent": true, "expiresInSeconds": 300 }`. Responds identically whether or not the phone is registered, to avoid leaking which numbers have accounts.
- `POST /auth/password/reset` — `{ "phone", "otp", "newPassword" }` → `{ "ok": true }`. On success, every existing session for that account is invalidated (same `tokenVersion` bump as Logout All Devices) — the app should route back to login afterward.

### Session management

- `POST /auth/logout-all` (authenticated) — invalidates every JWT issued to this
  account on every device, immediately. Use for a "Logout All Devices" security
  screen or after a suspected compromise. The current call's own token also stops
  working after this — the app should clear local storage and route to login.
- `GET /auth/login-history` (authenticated) — last 20 successful logins (IP,
  user-agent, timestamp) for a "Last Login Device History" screen. Backed by the
  same activity log every login already writes, not a separate device-tracking
  system, so there's no explicit device naming/fingerprinting — just IP + UA string.

### `GET /auth/me`
Returns the logged-in user's profile + wallet balance. Good for a "who am I" call on
app startup to hydrate state.
```json
{ "id": "uuid", "name": "Test Retailer", "phone": "8888888888", "role": "RETAILER", "walletBalance": "12602.96" }
```

## Roles

| Role | What it means for the app |
|---|---|
| `RETAILER` | Bottom of the hierarchy — the typical app user doing recharges for customers. No downline. |
| `DISTRIBUTOR` | Has retailers under them. Can fund their downline's wallets, see downline reports. |
| `MASTER_DISTRIBUTOR` | Has distributors under them. Same capabilities, one level up. |
| `ADMIN` | Platform owner. Full access, root of the hierarchy. |

A user only ever sees/affects their own downline tree — enforced server-side on every
endpoint, not just in the UI.

## Error format

Every error response, from every endpoint, is:
```json
{ "error": "human-readable message" }
```
with an appropriate HTTP status (`400` validation, `401` unauthenticated, `403`
forbidden/out-of-scope, `404` not found, `409` conflict, `429` rate-limited, `503`
upstream/provider unavailable, `500` unexpected).

## Rate limits

| Limiter | Limit | Applies to |
|---|---|---|
| Auth | 10 / 15 min per IP | `/auth/login` |
| General API | 120 / min per logged-in user (falls back to IP if unauthenticated) | everything else by default |
| Transactions | 20 / min per logged-in user | recharge, BBPS pay, DMT transfer, AEPS |

Limiting is keyed by **user id**, not just IP — so retailers sharing a mobile
carrier's IP (common with carrier-grade NAT) never throttle each other.

---

## Wallet

### `GET /wallet/balance`
```json
{ "balance": "12602.96" }
```

### `GET /wallet/ledger?page=&pageSize=&type=&referenceType=&from=&to=`
Paginated transaction history for the logged-in user's own wallet (credits + debits).

### `GET /wallet/opening-closing?from=&to=`
Opening/closing balance for a date range — useful for a "statement" screen.

### `POST /wallet/transfer` (DISTRIBUTOR/MASTER_DISTRIBUTOR/ADMIN only)
Send funds to a direct downline member.
```json
// request
{ "toUserId": "uuid", "amount": 500, "paymentMode": "CASH", "utrNumber": "optional", "autoCommission": false }
```

### Add Money (self-service wallet top-up via payment gateway)

Currently backed by a **mock gateway** — the real flow (Razorpay/Cashfree/PayU
account, real webhook secret) is a config swap once that vendor account exists, not
a rebuild. The wallet is only ever credited by the signature-verified webhook, never
by the client claiming success — this matters, since anything else would let a user
credit their own wallet for free.

**`POST /wallet/add-money/order`** — `{ "amount": 500 }` → `201`:
```json
{ "order": { "id": "uuid", "gatewayOrderId": "mock_order_...", "amount": "500", "status": "PENDING" }, "checkoutUrl": "https://..." }
```
The app opens `checkoutUrl` in the gateway's SDK/checkout UI. With a real gateway,
this is where its actual order-creation response and checkout params go.

**`POST /wallet/add-money/webhook`** — called by the gateway's own servers, not the
app. No JWT — authenticated by an `X-Signature` header (HMAC-SHA256 over the raw
body) instead. Idempotent: a retried webhook for an already-settled order is a
no-op, not a double-credit.

**`POST /wallet/add-money/mock-pay`** — `{ "gatewayOrderId" }` — **mock-gateway-only,
delete this once a real gateway is wired in.** Stands in for the Flutter app's real
gateway checkout SDK completing (which would talk to the gateway's servers directly,
never to us, until the webhook fires). Internally round-trips through the exact same
signature-verified webhook path — useful for testing the whole flow without a real
gateway account.

**`GET /wallet/add-money/history`** — the logged-in user's own top-up attempts,
`{ "orders": [...] }`.

---

## Recharge

### `GET /operators?activeOnly=1`
List operators available to recharge against. **Always pass `activeOnly=1` from the
app** — this filters out any operator the admin has disabled, so the UI never offers
a dead option. (Omitting it, as the admin panel's management screens do, returns
every operator including disabled ones.)
```json
{ "operators": [{ "id": "uuid", "name": "Airtel", "code": "AIRTEL", "type": "PREPAID" }] }
```
`type` is a free-form string, not an enum — today's seeded values are `PREPAID`,
`DTH`, `FASTAG`, `OTT`, `ELECTRICITY`, `GAS`, `DMT`, `AEPS`. **All of "Mobile
Recharge", "DTH Recharge", and "FASTag Recharge" (and any OTT-subscription tile)
are the exact same `POST /recharge` call below** — just with a different
`operatorCode` and whatever the recharge target happens to be in `mobileNumber`
(a DTH subscriber ID, a vehicle/FASTag ID, etc. — the field name is a holdover from
recharge being mobile-first, the value is really just "identifier"). There is no
separate DTH/FASTag/OTT endpoint or engine — group operators client-side by `type`
to build those separate menu tiles.

### `GET /operators/detect?mobileNumber=`
Best-guess operator as soon as enough digits are typed (e.g. showing the Jio logo
while the user is still typing the mobile number) — matched by longest known prefix.
```json
{ "operator": { "id": "uuid", "name": "Jio", "code": "JIO", "type": "PREPAID" } }
// or { "operator": null } if nothing matches
```
**This is a heuristic, not authoritative** — numbers can be ported between operators
(MNP), so the app should let the user confirm/override the detected operator rather
than silently locking it in, the same way AP Money's own app does.

### `GET /plans?operatorCode=`
"Explore Plans" — lets the user browse and pick a plan instead of typing an amount
blind. Returns only plans the admin has marked active for that operator.
```json
{
  "plans": [
    { "id": "uuid", "amount": "299.00", "validity": "28 days", "data": "1.5GB/day",
      "talktime": null, "sms": "100/day", "description": null, "category": "Popular" }
  ]
}
```
Selecting a plan just means pre-filling `amount` in the normal `POST /recharge` call
below — plans aren't a separate transaction type.

### `POST /recharge`
```json
// request
{ "operatorCode": "AIRTEL", "mobileNumber": "9812345678", "amount": 199 }

// response 201
{
  "transaction": {
    "id": "uuid", "status": "SUCCESS", "amount": "199", "commission": "3.98",
    "providerRefId": "MOCK-...", "identifier": "9812345678", ...
  }
}
```
The wallet is debited synchronously before the provider is called; on failure the
amount is auto-refunded and `status` is `"FAILED"`. There's a small chance of
`"PENDING"` if the provider never responds — those show up in the admin's Pending
queue and get resolved from there (SMS is sent to the user either way once resolved).

### `GET /recharge/history?page=&pageSize=&status=&type=&search=&from=&to=`
Paginated transaction history (own transactions only for a RETAILER; whole downline
for DISTRIBUTOR+).

---

## BBPS (Bill Payments)

### `POST /bbps/fetch-bill`
```json
{ "operatorCode": "MSEB", "consumerNumber": "1234567890" }
// -> { "bill": { "amount": "...", "dueDate": "...", "consumerName": "..." } }
```

### `POST /bbps/pay`
```json
{ "operatorCode": "MSEB", "consumerNumber": "1234567890", "amount": 450 }
// -> 201 { "transaction": { ... } }
```

---

## DMT (Domestic Money Transfer)

Flow: register + verify a remitter (the sender, a walk-in customer) once, add
beneficiaries under them, then transfer.

- `GET /dmt/remitters` — the logged-in retailer's registered remitters
- `GET /dmt/remitters/search?mobileNumber=` — look up an existing remitter by phone
- `POST /dmt/remitters` — `{ "name", "mobileNumber" }`
- `POST /dmt/remitters/:id/verify` — marks the remitter KYC-verified (mock)
- `GET /dmt/remitters/:id/beneficiaries`
- `POST /dmt/remitters/:id/beneficiaries` — `{ "name", "accountNumber", "ifsc", "bankName" }`
- `POST /dmt/transfer` — `{ "remitterId", "beneficiaryId", "amount", "mode": "IMPS" | "NEFT" }` → `201 { "transaction": {...} }`

---

## AEPS

- `POST /aeps/withdrawal` — `{ "aadhaarNumber" (12 digits), "bankName", "amount" (max 10000) }`
- `POST /aeps/balance-enquiry` — `{ "aadhaarNumber", "bankName" }`

Both return `201 { "transaction": {...} }`.

---

## Cashback & Referrals

Both of these are **automatic, server-side side effects of a successful transaction**
— there's no separate endpoint the app calls to "claim" cashback or a referral
reward. They land as extra credits on the user's wallet, distinguishable in
`/wallet/ledger` by `referenceType`: `"CASHBACK"` and `"REFERRAL_REWARD"`.

- **Cashback**: if an admin has an active `CashbackOffer` matching the operator (or
  a platform-wide offer) and the transaction amount clears its minimum, the best
  (highest-percent) matching offer's cashback is credited to the transacting user's
  own wallet the moment the transaction settles SUCCESS.
- **Referral reward**: if the transacting user was created with a `referredByCode`
  (see `POST /users` below), a configurable percentage of every successful
  transaction they make is credited to the **referrer's** wallet, not their own.

### `GET /wallet/cashback-summary`
Total cashback earned + last 100 cashback ledger entries, for a "Cashback earned"
screen.
```json
{ "totalCashback": "142.50", "entries": [ { "amount": "7.50", "description": "...", "createdAt": "..." } ] }
```

### `GET /users/my-referrals`
"Refer Friends" screen: the logged-in user's own referral code to share, who they've
referred, and total reward earned so far.
```json
{
  "referralCode": "MM7K2QXP",
  "referredUsers": [{ "id": "uuid", "name": "...", "phone": "...", "createdAt": "..." }],
  "totalEarned": "310.00"
}
```
Note: today an account is only created via the admin/distributor-driven `POST /users`
(there's no public self-signup), and that endpoint accepts an optional
`"referredByCode"` field to link the new account to whoever referred them — so
"sharing a referral code" in practice means the referred person gives that code to
whoever is onboarding them, not a self-serve signup flow.

---

## KYC

- `GET /kyc/me` — the logged-in user's own KYC status + latest submission
- `POST /kyc` — `{ "aadhaarNumber" (12 digits), "panNumber" (ABCDE1234F format) }`, blocked if already PENDING/APPROVED

*(Known gap: only Aadhaar/PAN numbers are captured today, no document image upload.
If the app needs a photo-based KYC flow — Aadhaar card photo, PAN photo, selfie — that
needs a file-upload endpoint + storage that doesn't exist yet. Flag if needed.)*

---

## Complaints

- `POST /complaints` — `{ "subject", "description", "transactionRef"? }`
- `GET /complaints` — the logged-in user's own complaints

---

## Balance Requests (retailer deposits cash → parent approves)

- `GET /bank-accounts` — active bank accounts to deposit into
- `GET /bank-accounts/:id/upi-qr?amount=` — real scannable UPI QR (`upi://pay?...` deep link + PNG data URL) for one of those accounts
- `POST /balance-requests` — `{ "amount", "utrNumber" }` — file a claim after depositing
- `GET /balance-requests` — the logged-in user's own claims + status

---

## Notifications (in-app)

- `GET /broadcast/my-notifications` — `{ "notifications": [...], "unreadCount": n }`. Poll
  this periodically (there's no push/websocket layer yet — see Known Gaps).
- `POST /broadcast/my-notifications/mark-read` — marks all as read

---

## Notices (platform-wide banner)

- `GET /notices/active` — the current announcement banner, if any (`{ "notice": { "message": "..." } | null }`)

---

## Admin: Transaction History & Pendings (MASTER_DISTRIBUTOR/DISTRIBUTOR/ADMIN)

Powers the panel's Transaction History and Pendings screens. Scope is the caller's whole
downline (the entire platform for ADMIN). Provider `apiKey`/`apiSecret` are never included;
`apiProvider.walletBalance` (the "apibalance" column) is included for ADMIN only.

Clients should send `X-Client-Source: WEB` (web panel) or `APP` (mobile app, the default) on
money-movement calls; it is stored as `transaction.source` and shown/filterable as "Source".
Other values: `MANUAL` (admin Add Transaction), `QUEUE` (Q Recharge).

### `GET /admin/transactions`
Query (all optional): `from`, `to` (ISO date or datetime), `mobile`, `user` (name/phone),
`txnId` (prefix), `opRefId`, `status`, `type` (RECHARGE/BBPS/DMT/AEPS), `operatorId`,
`apiProviderId`, `source`, `amount`, `parentUser` (name/phone), `blankOpTxn=1`,
`blankResponse=1`, `onlyComplaints=1`, `disablePaging=1`, `page`, `pageSize` (≤200),
`order=asc|desc`.
Returns `{ transactions, total, page, pageSize, summary }` — `summary` has
`{ count, amount }` per status for the whole filtered set (the S/F/P/R chips).

### `GET /admin/transactions/export` — same filters, CSV download (max 5000 rows).

### `POST /admin/transactions/:id/action`
`{ outcome: "SUCCESS" | "FAILED" | "REFUND", providerRefId?, remark? }`
- SUCCESS / FAILED settle a PENDING transaction (FAILED refunds the user).
- REFUND reverses a SUCCESS transaction: the user gets the full amount back; commission,
  cashback and referral reward are debited back from whoever received them; the provider's
  Wallet 1 float is credited back; status becomes REFUNDED.

### `POST /admin/transactions/bulk-action` — `{ ids: string[] (≤500), outcome }`
Applies the same outcome to each row independently. Returns `{ done, failures: [{ id, error }] }`.

### `POST /admin/transactions/send-to-api` (ADMIN only)
`{ ids: string[], apiProviderId, background?: boolean }` — re-submits PENDING rows to the
chosen provider. If that provider is unreachable the row stays PENDING. With
`background: true` it returns `202 { queued }` immediately.

## Known gaps / roadmap (not built yet, flag if the app needs them)

- **No push notifications** — `/broadcast/my-notifications` is poll-based. Real-time
  push would need FCM integration + a device-token registration endpoint.
- **No KYC document upload** — only text fields (Aadhaar/PAN numbers) are captured.
- **No refresh-token flow** — the JWT is long-lived (7 days) with no silent-refresh
  endpoint; the app should just re-prompt login on expiry.
- **SMS/WhatsApp/Email are simulated** — logged to `SmsLog`/`WhatsappLog`/`EmailLog`
  with a ~95% simulated success rate, not sent through a real gateway yet (needs a
  real MSG91/Fast2SMS/WhatsApp Business API key from the client).
- **Static content pages are intentionally NOT a backend concern** — Privacy Policy,
  Refund Policy, T&C, User Agreement, About Us, Contact Us info, and in-app language
  switching are hardcoded in the Flutter app by design decision, not an oversight.
  No `/content/*` endpoint exists or is planned for these.
