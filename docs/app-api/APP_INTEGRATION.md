# MoneyMint — mobile app integration guide

For the developer building the MoneyMint mobile app. Read this first, then use:

| File | What it is |
|---|---|
| `openapi.yaml` | Exact request/response of every app endpoint (OpenAPI 3.1). Import into Swagger UI / Stoplight, or generate a Dart client (`openapi-generator-cli generate -g dart-dio`). Each operation has an `operationId`. |
| `MoneyMint-App.postman_collection.json` | Same endpoints in Postman. Set `baseUrl`, run **Auth → Login** — the token is saved automatically. |
| `../../app/` | A working Flutter reference app using all of these flows (`lib/api/api_client.dart`, `lib/screens/*`). Copy freely. |

The backend team keeps `openapi.yaml` in sync with the server (a contract test checks it).
If something here disagrees with the server, tell us — don't work around it.

---

## 1. Basics

- **Base URL**: given per environment (test server / production). All paths below are relative to it.
- **Headers on every request**
  - `Content-Type: application/json`
  - `X-Client-Source: APP` (marks transactions as coming from the app)
  - `Authorization: Bearer <token>` — every endpoint except `/app/config`, `/auth/otp/*`,
    `/auth/login`, `/auth/password/*`.
- **Money is a decimal string** in responses: `"amount": "199"`, `"balance": "16388.50"`.
  A few computed values are numbers. Always parse with `double.parse(v.toString())`.
  Send amounts in requests as JSON numbers (`"amount": 199`).
- **Timestamps** are ISO-8601 UTC (`2026-11-25T10:01:08.416Z`) — convert to local time for display.
- **Who uses the app**: retailers mostly; distributors can log in too (`user.role`).
  Accounts are created by a distributor/admin — there is no self sign-up.

## 2. Errors

Every error is a non-2xx status with:

```json
{ "error": "Insufficient balance", "code": "PIN_INCORRECT" }
```

`error` is already user-friendly — show it as is. `code` appears only where the app must
react differently (PIN). Status codes:

| Status | Meaning | App should |
|---|---|---|
| 400 | Invalid input / insufficient balance / wrong PIN | Show `error` |
| **401** | Token missing, expired (7 days), revoked by "log out all devices", or password reset | Clear the token, go to login |
| 403 | Account suspended/inactive, or not allowed | Show `error`; on login screen it means "contact distributor" |
| 404 | Not found (e.g. number not registered for OTP) | Show `error` |
| 409 | Duplicate (UTR already used, KYC already submitted, remitter exists) | Show `error` |
| 423 | `PIN_LOCKED` — 5 wrong PINs, locked 15 minutes | Show `error`, offer "Forgot PIN" |
| 429 | Too many requests (OTP resend cooldown 45 s; login 10 per 15 min; payments 20/min) | Show `error`, wait |
| 503 | Service paused / operator disabled / online top-up not configured | Show `error` |

Never treat anything except 401 as "logged out".

## 3. App start

```
GET /app/config                 (no token)
  → appVersion < minVersion     → blocking "Update required" (open updateUrl)
  → appVersion < latestVersion  → optional "Update available"
  → maintenance.active          → show maintenance.message
token saved?
  yes → GET /auth/me → 200: home   | 401: delete token → login
  no  → login
```

`/app/config.support` has the helpline phone/email/hours for the Help screen.

## 4. Login

**OTP (primary)**
1. `POST /auth/otp/request {phone}` — 10-digit number. `404` = not registered. A new OTP can
   be requested after 45 s (`429` before that); each OTP is valid 5 minutes, 5 tries.
2. `POST /auth/otp/verify {phone, otp}` → `{token, user}`.

**Password (secondary)**: `POST /auth/login {phone, password}` → `{token, user}`.
Forgot password: `POST /auth/password/reset-request {phone}` then
`POST /auth/password/reset {phone, otp, newPassword}` (logs out all devices).

Store the token in secure storage (`flutter_secure_storage`), not shared preferences.

**After login**: `POST /app/devices {token: <FCM token>, platform: "android"|"ios", appVersion}`.
Call again whenever FCM rotates the token.

**Logout**: `DELETE /app/devices {token: <FCM token>}`, then delete the session token.
"Log out of all devices": `POST /auth/logout-all` (every token, including this one, stops working).

Test servers: SMS is not connected, so ask the backend team for the test server's fixed OTP
(`DEV_FIXED_OTP`) or use password login with the test accounts they give you.

## 5. Transaction PIN

Optional second factor the user turns on in settings.

- `GET /auth/pin/status` → `{hasPin, pinEnabled}`.
- When `pinEnabled`, send `"pin": "1234"` in the body of **`POST /recharge`, `/bbps/pay`,
  `/dmt/transfer`, `/aeps/withdrawal`**. Ask for it right before submitting.
- Errors: `400 PIN_REQUIRED`, `400 PIN_INCORRECT` ("… 3 attempt(s) left"), `423 PIN_LOCKED`.
- Settings screen: first PIN `POST /auth/pin/set {pin}`; change `POST /auth/pin/set {pin, currentPin}`;
  turn on `POST /auth/pin/toggle {enabled:true}`; turn off `… {enabled:false, pin}`;
  forgot PIN `POST /auth/pin/reset-request` → OTP to the user's mobile → `POST /auth/pin/reset {otp, newPin}`.

## 6. Recharge (mobile, DTH, FASTag, OTT)

1. `GET /operators?activeOnly=1` once; group by `type`: `PREPAID`, `DTH`, `FASTAG`, `OTT`.
   (`ELECTRICITY`, `GAS`, … are bill payment; `DMT`, `AEPS` are internal.)
2. Mobile: after 4+ digits, debounce ~300 ms and call `GET /operators/detect?mobileNumber=…`.
   It's a best guess (numbers port) — preselect it, let the user change it.
3. Plans: `GET /plans?operatorCode=JIO` → group by `category` (tabs). Tapping a plan fills the amount.
   An empty list is normal for some operators — the user types the amount.
4. Pay: `POST /recharge {operatorCode, mobileNumber, amount, pin?, clientRef}`.

**Always send `clientRef`**: generate a UUID when the user taps Pay and keep it for that
payment. If the request times out or the connection drops, retry with the **same** clientRef:
if the server already processed it you get the original transaction back (`200`,
`"duplicate": true`) instead of a second charge. Use a new clientRef only for a new payment.

### Result: SUCCESS, FAILED or PENDING

`201 {transaction}` — look at `transaction.status`:

| status | Show | Money |
|---|---|---|
| `SUCCESS` | Success receipt; `providerRefId` = operator reference | Debited; commission (if any) credited |
| `FAILED` | Failed; `statusMessage` may explain | Already refunded to the wallet |
| `PENDING` | "Processing — we'll update you" | Debited; operator hasn't confirmed yet |

**PENDING is normal** with real operators. Poll `GET /recharge/status/{id}` every 5–10 s while
the result screen is open (stop after ~3 min); the user can leave — the final status appears
in History. The server settles it by itself (operator callback or automatic status check).
A PENDING that turns FAILED is refunded automatically. Later, a SUCCESS can (rarely) become
`REFUNDED` if the operator reverses it.

Refresh the wallet balance (`GET /wallet/balance`) after any payment.

## 7. Bill payment (BBPS)

1. Billers: operators of type `ELECTRICITY`, `GAS`, etc.
2. `POST /bbps/fetch-bill {operatorCode, consumerNumber}` → `{bill: {consumerName, dueAmount, dueDate}}`.
3. Confirm screen (amount editable) → `POST /bbps/pay {operatorCode, consumerNumber, amount, pin?, clientRef}`.
   Same result handling as recharge.

## 8. Money transfer (DMT)

The retailer sends money for a walk-in customer (the **remitter**) to a bank account (**beneficiary**).

1. `GET /dmt/remitters/search?mobileNumber=…` → `remitter` or `null`.
2. If null: `POST /dmt/remitters {name, mobileNumber}`.
3. Limit: ₹5,000 until `POST /dmt/remitters/{id}/verify` (KYC), then ₹25,000.
4. `GET /dmt/remitters/{id}/beneficiaries`; add with `POST … {name, accountNumber, ifsc, bankName}`.
5. `POST /dmt/transfer {remitterId, beneficiaryId, amount, mode: "IMPS"|"NEFT", pin?, clientRef}`.
   Transfer charges appear as `transaction.surcharge` (`deduction` = amount + surcharge).

## 9. Wallet & Add Money

- Balance `GET /wallet/balance`; statement `GET /wallet/ledger?page=&pageSize=` (each entry: CREDIT/DEBIT,
  amount, `balanceAfter`, description); cashback `GET /wallet/cashback-summary`.
- `GET /wallet/add-money/config` → `enabled`, `gateway` (`RAZORPAY` in production, `MOCK` on test
  servers), `limits {min,max}`, `chargePercents` (e.g. card 1.8 %, UPI 0 — show before paying).

**Online top-up with Razorpay** (`razorpay_flutter`):

```dart
final res = await api.post('/wallet/add-money/order', {'amount': 500});
final c = res['checkout'];
razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, (PaymentSuccessResponse r) async {
  final v = await api.post('/wallet/add-money/verify',
      {'orderId': r.orderId, 'paymentId': r.paymentId, 'signature': r.signature});
  // v['pending'] == true → "Payment received, wallet will be credited shortly"
});
razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, (PaymentFailureResponse r) => showError(r.message));
razorpay.open({
  'key': c['keyId'], 'order_id': c['orderId'], 'amount': c['amount'], 'currency': c['currency'],
  'name': c['name'], 'description': c['description'], 'prefill': c['prefill'],
});
```

The wallet is credited by the server only after Razorpay confirms — if `/verify` fails because
the network dropped, the money still arrives via Razorpay's webhook; just refresh later.

On test servers (`gateway: "MOCK"`) there is no Razorpay: after `/order` call
`POST /wallet/add-money/mock-pay {gatewayOrderId: checkout.orderId, method: "upi"|"card"}`.

**Own UPI QR**: `GET /wallet/add-money/qr` — show `imageUrl` if present, else decode `qrDataUrl`
(base64 PNG data URL). Any UPI payment to it credits the wallet automatically.

**History**: `GET /wallet/add-money/history` (`channel` GATEWAY/QR, `status` PENDING/PAID/FAILED,
`charges`, `netAmount` = credited).

**Bank deposit (balance request)**: `GET /bank-accounts` (where to deposit),
`GET /payment-modes`, then `POST /balance-requests {amount, utrNumber, bankAccountId, paymentMode, depositedAt}`;
the distributor approves it. List with `GET /balance-requests`. A UTR can be used only once (`409`).

## 10. History, complaints, other screens

- History: `GET /recharge/history?page=&pageSize=&status=&type=&search=&from=&to=` — all services.
- Complaint on a transaction: `POST /complaints {subject, description, transactionRef: <transaction id>}`;
  list `GET /complaints` (`adminRemarks` = reply).
- KYC: `GET /kyc/me`, submit `POST /kyc {aadhaarNumber, panNumber}`.
- My commission rates: `GET /users/my-commission`. Referrals: `GET /users/my-referrals`.
- Profile: `GET /auth/me` (`email`, `kycStatus`, `walletBalance`); edit email `PATCH /auth/me {email}`.
- News banner: `GET /notices/active`. Notifications: `GET /broadcast/my-notifications`
  (`unreadCount` for the bell), `POST /broadcast/my-notifications/mark-read` when opened.

## 11. Not available yet

- **Push notifications**: register FCM tokens now (section 4); the server starts sending pushes
  once Firebase credentials are configured. Until then use `/broadcast/my-notifications`.
- **AEPS**: endpoints exist, but real withdrawals need a certified fingerprint device (RD service)
  integration — agree the design with the backend team before building this screen.
- **Real SMS**: OTPs are not delivered on test servers (see section 4).

## 12. Checklist before release

- [ ] Version gate and maintenance message from `/app/config`.
- [ ] 401 anywhere → login; nothing else logs the user out.
- [ ] `clientRef` on every payment, reused on retry.
- [ ] PENDING handled (poll, then History) — never shown as failed.
- [ ] Amounts parsed from strings; displayed in Indian format (₹1,23,456.00).
- [ ] PIN errors (`PIN_REQUIRED`, `PIN_INCORRECT`, `PIN_LOCKED`) handled.
- [ ] FCM token registered after login, removed on logout.
- [ ] Production base URL over HTTPS only.
