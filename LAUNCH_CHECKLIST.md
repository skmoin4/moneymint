# MoneyMint Launch Checklist

External vendors, licences, and third-party APIs MoneyMint needs before it can move
real money — as opposed to code we still need to write ourselves. Everything else in
this repo (wallet engine, recharge/BBPS/DMT/AEPS flows, OTP login, cashback,
referrals, admin panel) is our own code and is done.

This file is meant to be updated over time — when a vendor account is opened, an
agreement is signed, or an API key lands, mark the item done and add a dated line to
the Status Log at the bottom.

**Status:** ⬜ not started · 🟡 in progress · ✅ done

---

## Business & regulatory

Comes first on purpose — every vendor below this line will ask for these before
they'll even open a conversation.

- ⬜ **Registered company + GST** — *Launch-blocking*
  Every API vendor on this page requires a registered business entity to sign an
  agreement, not an individual account. Prerequisite to everything else here.

- ⬜ **Business Correspondent (BC) agreement** — *Launch-blocking* — Partner bank / NBFC
  AEPS and DMT are legally bank-led services in India — MoneyMint operates as a BC
  under a partner bank/NBFC's licence. Every AEPS/DMT vendor checks for this
  agreement before onboarding.

- ⬜ **PMLA / AML compliance registration** — *Launch-blocking*
  Mandatory reporting obligation for any entity moving customer money through AEPS
  or DMT, independent of which vendor ends up handling the transfers.

## Telecom & bill payment providers

Replace `mockProviderService.ts` — the engine (failover, wallet depletion, retries,
commission) was built against this exact interface, so swapping in a real vendor is
a config change, not a rebuild.

- ⬜ **Recharge API aggregator** — *Launch-blocking* — Robotics Exchange, Reloadly, PaySprint, RC1
  Mobile prepaid, DTH — the core product.
  **Credentials needed:** API Key/Token, Member ID or Partner ID (most vendors require
  this alongside the key), and often a static outbound IP to whitelist with them.
  **Where it goes:** no code change needed any more. Add the vendor on the APIs page
  (API key/secret), then fill in its request URL, reply fields, status-check URL and
  callback params on **API Parsing Setting** from the vendor's API document, give the
  vendor the callback URL shown there, set each operator's vendor code, and switch the
  API to "Live vendor API". Test with "Preview request" / "Test a sample reply" first.

- ⬜ **BBPS partner (BBPOU-affiliated)** — *Launch-blocking* — Setu, Cashfree BBPS, PaySprint, in.mobiswitch
  NPCI's Bharat Bill Payment System can't be reached directly — has to go through an
  already-licensed Bharat Connect Operating Unit.

- ⬜ **AEPS switch provider** — *Launch-blocking* — PaySprint, Fingpay, Spice Money infra
  Needs to already be NPCI-empaneled for Aadhaar-enabled payment services.

- ⬜ **DMT provider** — *Launch-blocking* — PaySprint, Decentro, Cashfree
  Handles the actual IMPS/NEFT rails that move money into a beneficiary's bank
  account.

## Biometric hardware

Lives inside the Flutter app, not on our server.

- ⬜ **RD Service / biometric device SDK** — *Launch-blocking* — Mantra MFS100, Morpho/IDEMIA, Startek, SecuGen
  A driver inside the retailer-facing app that talks to the fingerprint scanner and
  encrypts the capture to UIDAI's spec. AEPS is non-functional without one — no
  server-side workaround exists.

## Identity & KYC

Today's KYC screen stores whatever Aadhaar/PAN number is typed in — nothing is
actually verified yet.

- ⬜ **Aadhaar eKYC** — *Launch-blocking* — Digio, Signzy, Karza, IDfy
  Via a UIDAI-authorised KYC User Agency — confirms the number is real and belongs
  to the person submitting it.

- ⬜ **PAN verification** — *Launch-blocking* — Protean (NSDL), bundled in Digio/Karza

- ⬜ **Penny-drop / bank account verification** — *Launch-blocking* — Decentro, Cashfree, Razorpay
  Confirms a DMT beneficiary's account number matches the name given, before money
  moves. Without it, a typo sends money to a stranger.

- ⬜ **Document + selfie storage** — *Needed to scale* — AWS S3, Cloudflare R2, GCS
  No file storage exists in the system today. Needed once KYC grows past typed
  numbers into photo/document uploads.

## Payments & money movement

- 🟡 **Payment gateway for wallet top-up** — *Needed to scale* — Razorpay, Cashfree Payments, PayU
  Backend integration point is built and tested (order creation, signature-verified
  webhook, idempotent crediting) against a mock gateway — see `paymentGateway.ts` /
  `mockPaymentGatewayService.ts`. What's left is entirely on the vendor side: open a
  Razorpay/Cashfree/PayU account (needs the company registration + GST above), then
  swap the mock's `createMockOrder`/webhook secret for the real SDK — no rebuild.
  **Credentials needed (Razorpay, as the reference case):** Key ID, Key Secret, and a
  separate Webhook Secret (set when the webhook URL is registered in their dashboard —
  this is what `verifySignature()` checks against, distinct from the API secret).
  Cashfree/PayU use the same three-piece shape under different names (App ID + Secret
  Key + Webhook Secret; Merchant Key + Salt for PayU). **Where it goes:** `.env` as
  `PAYMENT_WEBHOOK_SECRET` (already wired) plus new vars for the Key ID/Secret, read
  from `mockPaymentGatewayService.ts` once that file's `createMockOrder` is replaced
  with a real SDK call.

- ⬜ **Payout API** — *Needed to scale* — RazorpayX Payouts, Cashfree Payouts, Decentro
  Automates commission withdrawals and refunds going out to a retailer's bank
  account instead of a manual transfer.

## Communications

Replaces the simulated `SmsLog` / `WhatsappLog` / `EmailLog` tables — every message
is already logged, just not actually sent anywhere real yet.

- ⬜ **SMS gateway (DLT-registered)** — *Launch-blocking* — MSG91, Fast2SMS, Kaleyra
  OTP login and every transaction alert already assume this exists. Needs a DLT
  template + sender-ID registered with TRAI first — that registration takes longer
  than the integration itself.
  **Credentials needed:** API Key, an approved Sender ID (6 characters), a DLT Entity
  ID (the business's own DLT registration), and one DLT Template ID per message
  template (OTP, transaction alert, etc. — each exact wording must be pre-registered
  and match what the code sends). **Where it goes:** `.env`, read from `smsService.ts`
  once its simulated `sendSms()` is replaced with a real gateway call — currently zero
  env vars exist for this, it's fully mocked.

- ⬜ **Push notifications** — *Needed to scale* — Firebase Cloud Messaging
  The in-app notification bell is poll-based today — this makes it a real push.

- ⬜ **WhatsApp Business API** — *Nice-to-have* — Gupshup, Interakt, Meta Cloud API

- ⬜ **Email** — *Nice-to-have* — AWS SES, SendGrid, Resend

## Infrastructure & ops

- ⬜ **Production hosting + managed Postgres** — *Launch-blocking* — AWS/GCP/DigitalOcean + RDS/Neon/Supabase
  Everything currently runs on a local dev machine.

- ⬜ **Automated backups** — *Launch-blocking*
  Point-in-time recovery on the database. No transaction or wallet-ledger row can be
  allowed to just disappear once real money is involved.

- ⬜ **Error tracking + uptime monitoring** — *Needed to scale* — Sentry, Better Stack

---

## Status Log

- **2026-08-25** — Checklist created after building out OTP/PIN auth, cashback,
  referrals, and the DTH/FASTag/OTT operator categories. Nothing on this list
  started yet — everything below the code layer is still simulated/mocked.
- **2026-08-27** — Built the full Add Money backend (order creation, signature-verified
  webhook, idempotent wallet crediting) against a mock payment gateway. Live-tested:
  wallet credits correctly, retried webhooks don't double-credit, forged/missing
  signatures are rejected with 401. Payment gateway item moved to 🟡 — only the real
  vendor account is still outstanding, the integration point is ready for it.
- **2026-08-27** — Added exact credential lists (which keys, where they plug in) under
  the Recharge API aggregator, Payment gateway, and SMS gateway items, so whoever opens
  those vendor accounts knows precisely what to bring back.
- **2026-11-25** — Recharge engine made vendor-ready: any HTTP recharge vendor can be
  configured from the panel (API Parsing Setting) without code; PENDING replies are now
  held and settled by vendor callback or automatic status check; API logs per
  transaction; mock payments and webhook secret locked down; suspended users blocked.
  Tested end to end against a local fake vendor. Recharge aggregator item still ⬜ — it
  needs a real vendor account, not code.
- **2026-11-25** — Commission chain built: differential commission for Retailer /
  Distributor / Master Distributor, amount-range slabs, surcharge (DMT/BBPS), vendor margin
  per operator↔API, TDS withholding, Commission Distribution report with platform margin.
  Confirm the TDS rate and the GST treatment of surcharge with your CA before launch.
