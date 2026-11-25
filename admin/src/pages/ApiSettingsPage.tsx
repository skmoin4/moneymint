import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Copy } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { PageLoader } from "../components/ui/PageLoader";
import { Panel } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { compactInputClasses, inputClasses } from "../components/ui/FormField";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";
import { Badge } from "../components/ui/Badge";
import { errorText, formatStamp } from "../components/txn/types";

interface Me {
  enabled: boolean;
  isActive?: boolean;
  hasToken?: boolean;
  tokenPrefix?: string | null;
  allowedIps?: string;
  callbackUrl?: string | null;
  callbackMethod?: "POST" | "GET";
  callbackSecret?: string;
  lastUsedAt?: string | null;
  baseUrl?: string;
}

interface Callback {
  id: string;
  transactionId: string;
  payload: string;
  status: string;
  attempts: number;
  lastHttpStatus: number | null;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
}

function CopyButton({ text }: { text: string }) {
  return (
    <Button size="sm" variant="secondary" type="button" onClick={() => navigator.clipboard?.writeText(text)}>
      <Copy size={12} /> Copy
    </Button>
  );
}

// An API user's own token, IP whitelist and callback settings.
export function ApiSettingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [ips, setIps] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [method, setMethod] = useState<"POST" | "GET">("POST");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [callbacks, setCallbacks] = useState<Callback[]>([]);
  const [testResult, setTestResult] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get("/api-access/me").then((res) => {
      setMe(res.data);
      if (res.data.enabled) {
        setIps((res.data.allowedIps ?? "").split(",").filter(Boolean).join("\n"));
        setCallbackUrl(res.data.callbackUrl ?? "");
        setMethod(res.data.callbackMethod ?? "POST");
        api.get("/api-access/me/callbacks").then((r) => setCallbacks(r.data.callbacks));
      }
    });
  }, []);
  useEffect(load, [load]);

  async function generate() {
    if (me?.hasToken && !window.confirm("Generate a new token? The current token stops working immediately.")) return;
    const res = await api.post("/api-access/me/token");
    setNewToken(res.data.token);
    load();
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await api.put("/api-access/me", { allowedIps: ips, callbackUrl: callbackUrl.trim() || null, callbackMethod: method });
      setMessage({ ok: true, text: "Saved." });
      load();
    } catch (err) {
      setMessage({ ok: false, text: errorText(err) });
    }
  }

  async function testCallback() {
    setTestResult("Sending…");
    try {
      const r = await api.post("/api-access/me/test-callback");
      setTestResult(r.data.ok ? `OK — your server answered HTTP ${r.data.httpStatus}` : `Failed — ${r.data.httpStatus ? `HTTP ${r.data.httpStatus}` : r.data.response}`);
    } catch (err) {
      setTestResult(errorText(err));
    }
  }

  async function rotateSecret() {
    if (!window.confirm("Create a new callback secret? Update it on your server, or signature checks will fail.")) return;
    await api.post("/api-access/me/callback-secret");
    load();
  }

  async function resend(id: string) {
    await api.post(`/api-access/me/callbacks/${id}/resend`);
    setTimeout(load, 12000);
    setCallbacks((cs) => cs.map((c) => (c.id === id ? { ...c, status: "PENDING" } : c)));
  }

  if (!me) return <PageLoader />;
  if (!me.enabled) {
    return (
      <div>
        <PageHeader title="API Token & Callback" />
        <div className="rounded-sm border border-ink-200 bg-white p-6 text-center text-ink-500">API access is not enabled for your account. Contact the administrator.</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="API Token & Callback" />
      {!me.isActive && <div className="mb-4 rounded-sm bg-row-failed px-3 py-2 text-[12.5px] text-[#a94442]">Your API access is currently disabled by the administrator.</div>}

      <Panel title="API token">
        {newToken ? (
          <div className="flex flex-col gap-2">
            <div className="rounded-sm bg-row-pending px-3 py-2 text-[12.5px] text-[#8a6d3b]">Copy this token now — it won't be shown again.</div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-sm bg-ink-50 px-2 py-1.5 text-[12.5px]">{newToken}</code>
              <CopyButton text={newToken} />
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span>{me.hasToken ? <>Active token: <code>{me.tokenPrefix}…</code></> : "No token yet."}</span>
            {me.lastUsedAt && <span className="text-ink-500">Last used {formatStamp(me.lastUsedAt)}</span>}
          </div>
        )}
        <Button className="mt-3" variant={me.hasToken ? "secondary" : "primary"} onClick={generate}>
          {me.hasToken ? "Generate new token" : "Generate token"}
        </Button>
        <div className="mt-3 text-[12.5px] text-ink-500">
          Base URL: <code>{me.baseUrl}</code> — send the token in the <code>X-Api-Token</code> header. See API Document.
        </div>
      </Panel>

      <form onSubmit={save}>
        <Panel title="Server IPs & callback">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] font-bold">Whitelisted server IPs (one per line, max 10)</span>
              <textarea rows={4} value={ips} onChange={(e) => setIps(e.target.value)} className={`${inputClasses} font-mono`} placeholder="203.0.113.10" />
              <span className="text-[11.5px] text-ink-400">Requests from any other IP are refused, even with the right token.</span>
            </label>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[12.5px] font-bold">Callback URL</span>
                <input value={callbackUrl} onChange={(e) => setCallbackUrl(e.target.value)} className={inputClasses} placeholder="https://yourserver.com/moneymint/callback" />
              </label>
              <label className="flex items-center gap-2">
                <span className="text-[12.5px] font-bold">Method</span>
                <select value={method} onChange={(e) => setMethod(e.target.value as "POST" | "GET")} className={compactInputClasses}>
                  <option value="POST">POST (JSON body)</option>
                  <option value="GET">GET (query string)</option>
                </select>
              </label>
              <div className="text-[12.5px]">
                <span className="font-bold">Callback secret</span> (verifies our signature):
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <code className="break-all rounded-sm bg-ink-50 px-2 py-1">{me.callbackSecret}</code>
                  <CopyButton text={me.callbackSecret ?? ""} />
                  <Button size="sm" variant="secondary" type="button" onClick={rotateSecret}>
                    New secret
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="submit">Save</Button>
            <Button type="button" variant="secondary" onClick={testCallback} disabled={!me.callbackUrl}>
              Send test callback
            </Button>
            {testResult && <span className="text-[12.5px]">{testResult}</span>}
          </div>
          {message && (
            <div className={`mt-3 rounded-sm px-3 py-2 text-[12.5px] ${message.ok ? "bg-row-success text-[#3c763d]" : "bg-row-failed text-[#a94442]"}`}>{message.text}</div>
          )}
        </Panel>
      </form>

      <h2 className="mb-2 text-[17px] text-ink-800">Recent callbacks</h2>
      <Table>
        <THead>
          <Th>Time</Th>
          <Th>Client ref</Th>
          <Th>Outcome sent</Th>
          <Th>Delivery</Th>
          <Th>Attempts</Th>
          <Th>Your server said</Th>
          <Th />
        </THead>
        <tbody>
          {callbacks.length === 0 ? (
            <Tr>
              <Td colSpan={7} className="py-6 text-center text-ink-400">
                No callbacks yet.
              </Td>
            </Tr>
          ) : (
            callbacks.map((c) => {
              const p = JSON.parse(c.payload) as { client_ref: string; status: string };
              return (
                <Tr key={c.id}>
                  <Td className="whitespace-nowrap">{formatStamp(c.createdAt)}</Td>
                  <Td className="font-mono">{p.client_ref}</Td>
                  <Td>{p.status}</Td>
                  <Td>
                    <Badge variant={c.status === "SENT" ? "success" : c.status === "FAILED" ? "danger" : "warning"}>{c.status}</Badge>
                  </Td>
                  <Td>{c.attempts}</Td>
                  <Td className="text-[12px]">{c.lastHttpStatus ? `HTTP ${c.lastHttpStatus}` : ""} {c.lastError ?? ""}</Td>
                  <Td>
                    {c.status !== "SENT" && (
                      <button onClick={() => resend(c.id)} className="text-[#337ab7] hover:underline">
                        Resend
                      </button>
                    )}
                  </Td>
                </Tr>
              );
            })
          )}
        </tbody>
      </Table>
    </div>
  );
}
