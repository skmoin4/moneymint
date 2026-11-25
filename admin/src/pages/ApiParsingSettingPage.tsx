import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Copy, RefreshCw } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { compactInputClasses, inputClasses } from "../components/ui/FormField";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";
import { errorText, formatStamp } from "../components/txn/types";

interface ProviderRow {
  id: string;
  name: string;
  code: string;
}

interface HttpConfig {
  memberId: string;
  method: "GET" | "POST";
  url: string;
  contentType: "FORM" | "JSON";
  bodyTemplate: string;
  headers: string;
  timeoutSeconds: number;
  responseFormat: "JSON" | "TEXT";
  statusField: string;
  successValues: string;
  failureValues: string;
  pendingValues: string;
  opRefField: string;
  vendorRefField: string;
  messageField: string;
  statusCheckMethod: "GET" | "POST";
  statusCheckUrl: string;
  statusCheckBodyTemplate: string;
  statusCheckStatusField: string;
  statusCheckOpRefField: string;
  callbackTxnIdParam: string;
  callbackVendorRefParam: string;
  callbackStatusParam: string;
  callbackOpRefParam: string;
  callbackMessageParam: string;
  callbackAllowedIps: string;
}

interface Mapping {
  id: string;
  priority: number;
  isActive: boolean;
  providerOperatorCode: string | null;
  operator: { id: string; name: string; code: string; type: string };
}

interface Integration {
  id: string;
  name: string;
  code: string;
  integrationType: "MOCK" | "HTTP";
  httpConfig: HttpConfig;
  callbackUrl: string | null;
  mappings: Mapping[];
}

interface CallLog {
  id: string;
  transactionId: string | null;
  kind: string;
  method: string | null;
  url: string | null;
  requestBody: string | null;
  httpStatus: number | null;
  responseBody: string | null;
  parsedStatus: string | null;
  durationMs: number | null;
  createdAt: string;
}

const PLACEHOLDERS = "{mobile} {amount} {opcode} {txnid} {apikey} {apisecret} {memberid} {vendorref} {callbackurl}";

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-ink-100 py-2.5 last:border-0 md:grid-cols-[220px_1fr] md:gap-4">
      <div>
        <div className="text-[12.5px] font-bold text-ink-700">{label}</div>
        {hint && <div className="text-[11.5px] text-ink-400">{hint}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const STATUS_TINT: Record<string, string> = {
  SUCCESS: "bg-row-success",
  FAILED: "bg-row-failed",
  PENDING: "bg-row-pending",
  ERROR: "bg-row-failed",
  REJECTED: "bg-row-failed",
};

export function ApiParsingSettingPage() {
  const [params, setParams] = useSearchParams();
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const providerId = params.get("provider") ?? "";
  const [data, setData] = useState<Integration | null>(null);
  const [cfg, setCfg] = useState<HttpConfig | null>(null);
  const [type, setType] = useState<"MOCK" | "HTTP">("MOCK");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<{ recharge: { method: string; url: string; body: string | null }; statusCheck: { method: string; url: string; body: string | null } | null } | null>(null);
  const [sampleKind, setSampleKind] = useState<"REQUEST" | "STATUS_CHECK" | "CALLBACK">("REQUEST");
  const [sample, setSample] = useState("");
  const [parsed, setParsed] = useState<Record<string, unknown> | null>(null);
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [openLog, setOpenLog] = useState<string | null>(null);

  useEffect(() => {
    api.get("/providers").then((res) => {
      setProviders(res.data.providers);
      if (!providerId && res.data.providers[0]) setParams({ provider: res.data.providers[0].id }, { replace: true });
    });
  }, [providerId, setParams]);

  function load(id: string) {
    setMessage(null);
    setPreview(null);
    setParsed(null);
    api.get(`/providers/${id}/integration`).then((res) => {
      setData(res.data);
      setCfg(res.data.httpConfig);
      setType(res.data.integrationType);
    });
    api.get(`/providers/${id}/logs`, { params: { limit: 30 } }).then((res) => setLogs(res.data.logs));
  }

  useEffect(() => {
    if (providerId) load(providerId);
  }, [providerId]);

  function set<K extends keyof HttpConfig>(key: K, value: HttpConfig[K]) {
    setCfg((c) => (c ? { ...c, [key]: value } : c));
  }

  async function save() {
    if (!cfg || !data) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await api.put(`/providers/${data.id}/integration`, { integrationType: type, httpConfig: cfg });
      setData({ ...data, integrationType: type, callbackUrl: res.data.callbackUrl });
      setMessage({ ok: true, text: type === "HTTP" ? "Saved. New transactions on this API now go to the vendor." : "Saved. This API uses the built-in simulator." });
    } catch (err) {
      setMessage({ ok: false, text: errorText(err) });
    } finally {
      setSaving(false);
    }
  }

  async function runPreview() {
    if (!data || !cfg) return;
    try {
      const res = await api.post(`/providers/${data.id}/preview-request`, { httpConfig: cfg });
      setPreview(res.data);
    } catch (err) {
      setMessage({ ok: false, text: errorText(err) });
    }
  }

  async function runParse() {
    if (!data || !cfg) return;
    try {
      const res = await api.post(`/providers/${data.id}/test-parse`, { httpConfig: cfg, kind: sampleKind, sample });
      setParsed(res.data);
    } catch (err) {
      setParsed({ error: errorText(err) });
    }
  }

  async function rotateToken() {
    if (!data || !window.confirm("Generate a new callback URL? The old one stops working immediately — update it at the vendor.")) return;
    const res = await api.post(`/providers/${data.id}/callback-token`);
    setData({ ...data, callbackUrl: res.data.callbackUrl });
  }

  async function saveOpCode(m: Mapping, code: string) {
    if ((m.providerOperatorCode ?? "") === code.trim()) return;
    try {
      await api.patch(`/operators/mappings/${m.id}`, { providerOperatorCode: code.trim() || null });
      setData((d) => (d ? { ...d, mappings: d.mappings.map((x) => (x.id === m.id ? { ...x, providerOperatorCode: code.trim() || null } : x)) } : d));
    } catch (err) {
      setMessage({ ok: false, text: errorText(err) });
    }
  }

  const input = `${compactInputClasses} w-full`;
  const mono = `${inputClasses} font-mono text-[12px]`;

  return (
    <div>
      <PageHeader title="API Parsing Setting" />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-sm border border-ink-200 bg-white px-4 py-3">
        <span className="font-bold">API:</span>
        <select value={providerId} onChange={(e) => setParams({ provider: e.target.value })} className={`${compactInputClasses} min-w-56`}>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.code})
            </option>
          ))}
        </select>
        <span className="ml-2 font-bold">Mode:</span>
        <label className="flex items-center gap-1">
          <input type="radio" checked={type === "MOCK"} onChange={() => setType("MOCK")} /> Simulator (testing)
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={type === "HTTP"} onChange={() => setType("HTTP")} /> Live vendor API
        </label>
        <Button className="ml-auto" loading={saving} onClick={save} disabled={!cfg}>
          Save
        </Button>
      </div>

      {message && (
        <div className={`mb-4 rounded-sm px-3 py-2 text-[12.5px] ${message.ok ? "bg-row-success text-[#3c763d]" : "bg-row-failed text-[#a94442]"}`}>{message.text}</div>
      )}

      {cfg && data && (
        <>
          {type === "MOCK" && (
            <div className="mb-4 rounded-sm bg-row-pending px-3 py-2 text-[12.5px] text-[#8a6d3b]">
              Simulator mode: no real request is sent. Fill in the vendor's details below and switch to "Live vendor API" once you have the vendor's API document and credentials (the API key is set on the APIs page).
            </div>
          )}

          <Panel title="Callback URL (give this to the vendor)" bodyClassName="flex flex-wrap items-center gap-2 px-3 py-2.5">
            {data.callbackUrl ? (
              <>
                <code className="min-w-0 flex-1 break-all rounded-sm bg-ink-50 px-2 py-1 text-[12px]">{data.callbackUrl}</code>
                <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(data.callbackUrl!)}>
                  <Copy size={12} /> Copy
                </Button>
                <Button size="sm" variant="secondary" onClick={rotateToken}>
                  <RefreshCw size={12} /> New URL
                </Button>
              </>
            ) : (
              <span className="text-ink-500">Generated when you save this API in "Live vendor API" mode.</span>
            )}
          </Panel>

          <Panel title="1. Recharge request" bodyClassName="px-4 py-1">
            <Row label="Member ID" hint="Vendor's member / partner id → {memberid}">
              <input value={cfg.memberId} onChange={(e) => set("memberId", e.target.value)} className={input} />
            </Row>
            <Row label="Method">
              <select value={cfg.method} onChange={(e) => set("method", e.target.value as "GET" | "POST")} className={compactInputClasses}>
                <option>GET</option>
                <option>POST</option>
              </select>
            </Row>
            <Row label="Recharge URL" hint={`Placeholders: ${PLACEHOLDERS}`}>
              <textarea rows={2} value={cfg.url} onChange={(e) => set("url", e.target.value)} className={mono} placeholder="https://vendor.com/api/recharge?member_id={memberid}&token={apikey}&number={mobile}&amount={amount}&op={opcode}&txnid={txnid}" />
            </Row>
            {cfg.method === "POST" && (
              <>
                <Row label="Body type">
                  <select value={cfg.contentType} onChange={(e) => set("contentType", e.target.value as "FORM" | "JSON")} className={compactInputClasses}>
                    <option value="FORM">Form (a=1&b=2)</option>
                    <option value="JSON">JSON</option>
                  </select>
                </Row>
                <Row label="Body template">
                  <textarea rows={3} value={cfg.bodyTemplate} onChange={(e) => set("bodyTemplate", e.target.value)} className={mono} />
                </Row>
              </>
            )}
            <Row label="Extra headers" hint="One per line, e.g. Authorization: Bearer {apikey}">
              <textarea rows={2} value={cfg.headers} onChange={(e) => set("headers", e.target.value)} className={mono} />
            </Row>
            <Row label="Timeout (seconds)" hint="No reply in time → transaction stays PENDING">
              <input type="number" min={5} max={180} value={cfg.timeoutSeconds} onChange={(e) => set("timeoutSeconds", Number(e.target.value))} className={`${compactInputClasses} w-24`} />
            </Row>
          </Panel>

          <Panel title="2. Reading the reply" bodyClassName="px-4 py-1">
            <Row label="Reply format">
              <select value={cfg.responseFormat} onChange={(e) => set("responseFormat", e.target.value as "JSON" | "TEXT")} className={compactInputClasses}>
                <option value="JSON">JSON</option>
                <option value="TEXT">Plain text</option>
              </select>
            </Row>
            {cfg.responseFormat === "JSON" && (
              <Row label="Status field" hint='Dot path, e.g. status or data.txn_status'>
                <input value={cfg.statusField} onChange={(e) => set("statusField", e.target.value)} className={input} />
              </Row>
            )}
            <Row label="Success values" hint="Comma separated, case-insensitive">
              <input value={cfg.successValues} onChange={(e) => set("successValues", e.target.value)} className={input} />
            </Row>
            <Row label="Failure values" hint="Refunded to the user immediately">
              <input value={cfg.failureValues} onChange={(e) => set("failureValues", e.target.value)} className={input} />
            </Row>
            <Row label="Pending values" hint="Anything not listed above is also treated as pending">
              <input value={cfg.pendingValues} onChange={(e) => set("pendingValues", e.target.value)} className={input} />
            </Row>
            <Row label="Operator ref field" hint={cfg.responseFormat === "JSON" ? "Dot path (Op Txn)" : "Regex, first group, e.g. OPID[:=]\\s*(\\w+)"}>
              <input value={cfg.opRefField} onChange={(e) => set("opRefField", e.target.value)} className={input} />
            </Row>
            <Row label="Vendor txn id field">
              <input value={cfg.vendorRefField} onChange={(e) => set("vendorRefField", e.target.value)} className={input} />
            </Row>
            <Row label="Message field">
              <input value={cfg.messageField} onChange={(e) => set("messageField", e.target.value)} className={input} />
            </Row>
          </Panel>

          <Panel title="3. Status check" bodyClassName="px-4 py-1">
            <Row label="Status check URL" hint="Used automatically for pending transactions when no callback arrives. Leave blank if the vendor has none.">
              <textarea rows={2} value={cfg.statusCheckUrl} onChange={(e) => set("statusCheckUrl", e.target.value)} className={mono} placeholder="https://vendor.com/api/status?member_id={memberid}&token={apikey}&txnid={txnid}" />
            </Row>
            <Row label="Method">
              <select value={cfg.statusCheckMethod} onChange={(e) => set("statusCheckMethod", e.target.value as "GET" | "POST")} className={compactInputClasses}>
                <option>GET</option>
                <option>POST</option>
              </select>
            </Row>
            {cfg.statusCheckMethod === "POST" && (
              <Row label="Body template">
                <textarea rows={2} value={cfg.statusCheckBodyTemplate} onChange={(e) => set("statusCheckBodyTemplate", e.target.value)} className={mono} />
              </Row>
            )}
            <Row label="Status field" hint="Blank = same as the recharge reply">
              <input value={cfg.statusCheckStatusField} onChange={(e) => set("statusCheckStatusField", e.target.value)} className={input} />
            </Row>
            <Row label="Operator ref field" hint="Blank = same as the recharge reply">
              <input value={cfg.statusCheckOpRefField} onChange={(e) => set("statusCheckOpRefField", e.target.value)} className={input} />
            </Row>
          </Panel>

          <Panel title="4. Callback parameters" bodyClassName="px-4 py-1">
            <Row label="Our txn id param" hint="Param carrying the {txnid} we sent">
              <input value={cfg.callbackTxnIdParam} onChange={(e) => set("callbackTxnIdParam", e.target.value)} className={input} />
            </Row>
            <Row label="Vendor txn id param">
              <input value={cfg.callbackVendorRefParam} onChange={(e) => set("callbackVendorRefParam", e.target.value)} className={input} />
            </Row>
            <Row label="Status param" hint="Values read with the success/failure lists above">
              <input value={cfg.callbackStatusParam} onChange={(e) => set("callbackStatusParam", e.target.value)} className={input} />
            </Row>
            <Row label="Operator ref param">
              <input value={cfg.callbackOpRefParam} onChange={(e) => set("callbackOpRefParam", e.target.value)} className={input} />
            </Row>
            <Row label="Message param">
              <input value={cfg.callbackMessageParam} onChange={(e) => set("callbackMessageParam", e.target.value)} className={input} />
            </Row>
            <Row label="Allowed callback IPs" hint="Comma separated. Blank = any IP (the secret URL still protects it)">
              <input value={cfg.callbackAllowedIps} onChange={(e) => set("callbackAllowedIps", e.target.value)} className={input} />
            </Row>
          </Panel>

          <div className="grid gap-5 xl:grid-cols-2">
            <Panel title="Preview request" action={<Button size="sm" onClick={runPreview}>Preview</Button>}>
              {preview ? (
                <div className="flex flex-col gap-2 text-[12px]">
                  <div>
                    <div className="font-bold">Recharge ({preview.recharge.method})</div>
                    <code className="block break-all rounded-sm bg-ink-50 p-2">{preview.recharge.url}</code>
                    {preview.recharge.body && <code className="mt-1 block break-all rounded-sm bg-ink-50 p-2">{preview.recharge.body}</code>}
                  </div>
                  {preview.statusCheck && (
                    <div>
                      <div className="font-bold">Status check ({preview.statusCheck.method})</div>
                      <code className="block break-all rounded-sm bg-ink-50 p-2">{preview.statusCheck.url}</code>
                    </div>
                  )}
                  <div className="text-ink-400">Sample values: mobile 9876543210, amount 199, opcode JIO. Credentials shown as placeholders.</div>
                </div>
              ) : (
                <div className="text-ink-500">Shows the exact request this API will receive (with sample values), to compare against the vendor's document.</div>
              )}
            </Panel>

            <Panel title="Test a sample reply">
              <div className="mb-2 flex flex-wrap gap-3 text-[12.5px]">
                {(["REQUEST", "STATUS_CHECK", "CALLBACK"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-1">
                    <input type="radio" checked={sampleKind === k} onChange={() => setSampleKind(k)} />
                    {k === "REQUEST" ? "Recharge reply" : k === "STATUS_CHECK" ? "Status check reply" : "Callback URL"}
                  </label>
                ))}
              </div>
              <textarea
                rows={4}
                value={sample}
                onChange={(e) => setSample(e.target.value)}
                className={mono}
                placeholder={sampleKind === "CALLBACK" ? "txnid=abc&status=SUCCESS&opref=OP123" : '{"status":"SUCCESS","opid":"OP123","txid":"V789"}'}
              />
              <div className="mt-2 flex items-start gap-3">
                <Button size="sm" onClick={runParse} disabled={!sample.trim()}>
                  Test
                </Button>
                {parsed && <pre className="min-w-0 flex-1 overflow-x-auto rounded-sm bg-ink-50 p-2 text-[12px]">{JSON.stringify(parsed, null, 2)}</pre>}
              </div>
            </Panel>
          </div>

          <Panel title="Operator codes for this API" bodyClassName="p-0">
            {data.mappings.length === 0 ? (
              <div className="p-4 text-ink-500">This API isn't assigned to any operator yet — assign it on Provider API Setting.</div>
            ) : (
              <Table className="border-0">
                <THead>
                  <Th>Operator</Th>
                  <Th>Our code</Th>
                  <Th>Slot</Th>
                  <Th>Vendor's operator code (sent as {"{opcode}"})</Th>
                </THead>
                <tbody>
                  {data.mappings.map((m) => (
                    <Tr key={m.id}>
                      <Td>
                        {m.operator.name} <span className="text-ink-400">({m.operator.type.toLowerCase()})</span>
                      </Td>
                      <Td className="font-mono">{m.operator.code}</Td>
                      <Td>
                        API {m.priority}
                        {!m.isActive && <span className="ml-1 text-ink-400">(stopped)</span>}
                      </Td>
                      <Td>
                        <input
                          defaultValue={m.providerOperatorCode ?? ""}
                          placeholder={m.operator.code}
                          onBlur={(e) => saveOpCode(m, e.target.value)}
                          className={`${compactInputClasses} w-40 font-mono`}
                          aria-label={`Vendor code for ${m.operator.name}`}
                        />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>

          <Panel title="Recent API logs" action={<Button size="sm" variant="secondary" onClick={() => load(data.id)}>Refresh</Button>} bodyClassName="p-0">
            {logs.length === 0 ? (
              <div className="p-4 text-ink-500">No traffic with this API yet.</div>
            ) : (
              <Table className="border-0">
                <THead>
                  <Th>Time</Th>
                  <Th>Type</Th>
                  <Th>Result</Th>
                  <Th>HTTP</Th>
                  <Th>ms</Th>
                  <Th>Request</Th>
                </THead>
                <tbody>
                  {logs.map((l) => (
                    <Fragment key={l.id}>
                      <tr className={`cursor-pointer border-b border-white ${STATUS_TINT[l.parsedStatus ?? ""] ?? ""}`} onClick={() => setOpenLog(openLog === l.id ? null : l.id)}>
                        <Td className="whitespace-nowrap">{formatStamp(l.createdAt)}</Td>
                        <Td>{l.kind}</Td>
                        <Td className="font-semibold">{l.parsedStatus}</Td>
                        <Td>{l.httpStatus ?? ""}</Td>
                        <Td>{l.durationMs ?? ""}</Td>
                        <Td className="max-w-[420px] truncate font-mono text-[11.5px]" title={l.url ?? ""}>
                          {l.method} {l.url}
                        </Td>
                      </tr>
                      {openLog === l.id && (
                        <tr>
                          <td colSpan={6} className="bg-ink-50 p-3">
                            {l.requestBody && (
                              <>
                                <div className="text-[11.5px] font-bold">Request body</div>
                                <pre className="mb-2 whitespace-pre-wrap break-all text-[11.5px]">{l.requestBody}</pre>
                              </>
                            )}
                            <div className="text-[11.5px] font-bold">Response</div>
                            <pre className="whitespace-pre-wrap break-all text-[11.5px]">{l.responseBody}</pre>
                            {l.transactionId && <div className="mt-1 text-[11.5px] text-ink-500">Txn: {l.transactionId}</div>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
