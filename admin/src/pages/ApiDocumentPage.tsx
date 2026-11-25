import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Card";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";

interface Operator {
  code: string;
  name: string;
  type: string;
}

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-sm border border-ink-200 bg-ink-50 p-3 text-[12px] leading-relaxed text-ink-800">{children}</pre>;
}

function Endpoint({ path, desc, params, example, response }: { path: string; desc: ReactNode; params: [string, string][]; example: string; response: string }) {
  return (
    <Panel title={<span className="font-mono text-[15px]">{path}</span>}>
      <p className="mb-3 text-ink-600">{desc}</p>
      {params.length > 0 && (
        <Table className="mb-3">
          <THead>
            <Th>Parameter</Th>
            <Th>Description</Th>
          </THead>
          <tbody>
            {params.map(([k, v]) => (
              <Tr key={k}>
                <Td className="font-mono">{k}</Td>
                <Td>{v}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      <div className="mb-1 text-[12px] font-bold">Request</div>
      <Code>{example}</Code>
      <div className="mb-1 mt-3 text-[12px] font-bold">Response</div>
      <Code>{response}</Code>
    </Panel>
  );
}

// Partner API reference, filled in with this server's base URL.
export function ApiDocumentPage() {
  const [baseUrl, setBaseUrl] = useState(`${import.meta.env.VITE_API_URL ?? ""}/api/v1`);
  const [operators, setOperators] = useState<Operator[]>([]);

  useEffect(() => {
    api.get("/api-access/me").then((res) => res.data.baseUrl && setBaseUrl(res.data.baseUrl)).catch(() => {});
    api.get("/operators", { params: { activeOnly: 1 } }).then((res) => setOperators(res.data.operators)).catch(() => {});
  }, []);

  const H = `-H "X-Api-Token: YOUR_TOKEN"`;

  return (
    <div>
      <PageHeader title="API Document" />

      <Panel title="Getting started">
        <ol className="ml-5 list-decimal space-y-1 text-ink-700">
          <li>
            Under <b>API → API Token & Callback</b>: generate your token, whitelist your server's public IP, and set your callback URL.
          </li>
          <li>
            Base URL: <code className="rounded-sm bg-ink-50 px-1">{baseUrl}</code>
          </li>
          <li>
            Send the token in the <code>X-Api-Token</code> header (a <code>token</code> parameter also works, but headers don't end up in logs).
          </li>
          <li>Every endpoint accepts GET (query string) or POST (JSON or form body). Limit: 300 requests/minute.</li>
          <li>
            Recharges are paid from your MoneyMint wallet. Your commission is credited automatically on success.
          </li>
        </ol>
      </Panel>

      <Panel title="Status values">
        <Table>
          <THead>
            <Th>status</Th>
            <Th>Meaning</Th>
            <Th>What to do</Th>
          </THead>
          <tbody>
            {[
              ["SUCCESS", "Recharge done. operator_ref is the operator's reference.", "Mark success."],
              ["PENDING", "Accepted, operator hasn't confirmed yet. Amount stays debited.", "Wait for the callback, or call /status. Never resend with a new client_ref."],
              ["FAILED", "Failed. The amount is already back in your wallet.", "Mark failed / refund your customer."],
              ["REFUNDED", "Was SUCCESS, later reversed by the operator. Amount refunded.", "Reverse it on your side."],
              ["ERROR", "Request rejected (bad parameter, low balance, auth). No transaction was created.", "Fix and retry — the same client_ref may be reused."],
            ].map(([s, m, w]) => (
              <Tr key={s}>
                <Td className="font-mono font-bold">{s}</Td>
                <Td>{m}</Td>
                <Td>{w}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-3 text-ink-600">
          <b>client_ref</b> is your own unique id for each request. Sending the same client_ref again never recharges twice — you get the original transaction back with
          <code> "duplicate": true</code>. If a request times out, retry with the <b>same</b> client_ref.
        </p>
      </Panel>

      <Endpoint
        path="/recharge"
        desc="Mobile prepaid, DTH, FASTag, OTT — any operator code from the list below."
        params={[
          ["number", "Mobile / subscriber / account number (digits)"],
          ["amount", "Amount in ₹"],
          ["operator", "Operator code, e.g. JIO"],
          ["client_ref", "Your unique request id (letters, digits, _ . -; max 50)"],
        ]}
        example={`curl ${H} "${baseUrl}/recharge?number=9876543210&amount=199&operator=JIO&client_ref=ORD10001"`}
        response={`{
  "status": "SUCCESS",
  "txn_id": "6f1c…",
  "client_ref": "ORD10001",
  "number": "9876543210",
  "operator": "JIO",
  "amount": 199,
  "operator_ref": "OP7714191761",
  "message": null,
  "time": "2026-11-25T10:00:00.000Z",
  "balance": 25311.40
}`}
      />

      <Endpoint
        path="/status"
        desc="Current state of a transaction. Checks with the operator live if it has been pending for a while."
        params={[["client_ref  or  txn_id", "Which transaction"]]}
        example={`curl ${H} "${baseUrl}/status?client_ref=ORD10001"`}
        response={`{ "status": "PENDING", "txn_id": "…", "client_ref": "ORD10001", … , "balance": 25311.40 }`}
      />

      <Endpoint path="/balance" desc="Your wallet balance." params={[]} example={`curl ${H} "${baseUrl}/balance"`} response={`{ "status": "SUCCESS", "balance": 25311.40 }`} />

      <Endpoint
        path="/bill/fetch"
        desc="Fetch the due bill for a BBPS biller."
        params={[
          ["operator", "Biller code, e.g. MSEB"],
          ["consumer_no", "Consumer / account number"],
        ]}
        example={`curl ${H} "${baseUrl}/bill/fetch?operator=MSEB&consumer_no=012345678901"`}
        response={`{ "status": "SUCCESS", "consumerName": "…", "dueAmount": 1450, "dueDate": "…" }`}
      />

      <Endpoint
        path="/bill/pay"
        desc="Pay a bill. Same response as /recharge."
        params={[
          ["operator", "Biller code"],
          ["consumer_no", "Consumer / account number"],
          ["amount", "Amount in ₹"],
          ["client_ref", "Your unique request id"],
        ]}
        example={`curl -X POST ${H} -H "Content-Type: application/json" \\
  -d '{"operator":"MSEB","consumer_no":"012345678901","amount":1450,"client_ref":"BILL5001"}' \\
  "${baseUrl}/bill/pay"`}
        response={`{ "status": "PENDING", "txn_id": "…", "client_ref": "BILL5001", … }`}
      />

      <Panel title="Callback (we call your server)">
        <p className="mb-3 text-ink-600">
          When a transaction becomes SUCCESS, FAILED or REFUNDED we call your callback URL with the same fields as the responses above. Answer with HTTP 200 —
          otherwise we retry after 1, 5, 15, 60 and 180 minutes. You can see every callback and resend it from the API Token & Callback page.
        </p>
        <div className="mb-1 text-[12px] font-bold">POST (default) — JSON body, signature in header</div>
        <Code>{`POST https://yourserver.com/moneymint/callback
Content-Type: application/json
X-MoneyMint-Signature: <hex HMAC-SHA256 of the raw body, keyed with your callback secret>

{"status":"SUCCESS","txn_id":"…","client_ref":"ORD10001","number":"9876543210","operator":"JIO","amount":199,"operator_ref":"OP7714191761","message":null,"time":"…"}`}</Code>
        <div className="mb-1 mt-3 text-[12px] font-bold">GET — query string; signature = HMAC-SHA256 of the query string before "&signature="</div>
        <Code>{`GET https://yourserver.com/moneymint/callback?status=SUCCESS&txn_id=…&client_ref=ORD10001&…&signature=<hex>`}</Code>
        <div className="mb-1 mt-3 text-[12px] font-bold">Verifying the signature (Node.js)</div>
        <Code>{`const crypto = require("crypto");
const expected = crypto.createHmac("sha256", CALLBACK_SECRET).update(rawBody).digest("hex");
if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers["x-moneymint-signature"]))) {
  return res.status(401).end();
}`}</Code>
        <div className="mb-1 mt-3 text-[12px] font-bold">PHP</div>
        <Code>{`$raw = file_get_contents('php://input');
$ok = hash_equals(hash_hmac('sha256', $raw, $CALLBACK_SECRET), $_SERVER['HTTP_X_MONEYMINT_SIGNATURE'] ?? '');`}</Code>
      </Panel>

      <Panel title="Operator codes" bodyClassName="p-0">
        <Table className="border-0">
          <THead>
            <Th>Code</Th>
            <Th>Operator</Th>
            <Th>Type</Th>
          </THead>
          <tbody>
            {operators.map((o) => (
              <Tr key={o.code}>
                <Td className="font-mono font-bold">{o.code}</Td>
                <Td>{o.name}</Td>
                <Td className="capitalize">{o.type.toLowerCase()}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
