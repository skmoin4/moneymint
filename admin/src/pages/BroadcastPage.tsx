import { type FormEvent, useEffect, useState } from "react";
import { MessageSquareText, MessageCircle, Mail, Bell } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { FormField, inputClasses } from "../components/ui/FormField";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";

interface DownlineUser {
  id: string;
  name: string;
  phone: string;
}

const TABS = ["Send SMS", "Send WhatsApp", "Send Email", "Send Notification"] as const;
type Tab = (typeof TABS)[number];

const ENDPOINTS: Record<Tab, string> = {
  "Send SMS": "/broadcast/sms",
  "Send WhatsApp": "/broadcast/whatsapp",
  "Send Email": "/broadcast/email",
  "Send Notification": "/broadcast/notification",
};

function ScopeFields({
  scope,
  setScope,
  userId,
  setUserId,
  users,
}: {
  scope: string;
  setScope: (v: "ALL_DOWNLINE" | "SPECIFIC_USER") => void;
  userId: string;
  setUserId: (v: string) => void;
  users: DownlineUser[];
}) {
  return (
    <>
      <FormField label="Send To">
        <select value={scope} onChange={(e) => setScope(e.target.value as "ALL_DOWNLINE" | "SPECIFIC_USER")} className={inputClasses}>
          <option value="ALL_DOWNLINE">Entire Downline</option>
          <option value="SPECIFIC_USER">Specific User</option>
        </select>
      </FormField>
      {scope === "SPECIFIC_USER" && (
        <FormField label="User">
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className={inputClasses}>
            <option value="">- Select -</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.phone})</option>
            ))}
          </select>
        </FormField>
      )}
    </>
  );
}

export function BroadcastPage() {
  const [tab, setTab] = useState<Tab>("Send SMS");
  const [users, setUsers] = useState<DownlineUser[]>([]);
  const [scope, setScope] = useState<"ALL_DOWNLINE" | "SPECIFIC_USER">("ALL_DOWNLINE");
  const [userId, setUserId] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [waLogs, setWaLogs] = useState<any[]>([]);
  const [emailLogs, setEmailLogs] = useState<any[]>([]);

  useEffect(() => {
    api.get("/users").then((res) => setUsers(res.data.users));
  }, []);

  useEffect(() => {
    if (tab === "Send WhatsApp") api.get("/broadcast/whatsapp-logs").then((res) => setWaLogs(res.data.logs));
    if (tab === "Send Email") api.get("/broadcast/email-logs").then((res) => setEmailLogs(res.data.logs));
  }, [tab]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    setError("");
    setResult("");
    setSending(true);
    try {
      const payload: Record<string, unknown> = { scope, userId: scope === "SPECIFIC_USER" ? userId : undefined, message };
      if (tab === "Send Email") payload.subject = subject;
      const res = await api.post(ENDPOINTS[tab], payload);
      setResult(`Sent to ${res.data.sent}/${res.data.total ?? res.data.sent} recipient(s).`);
      setMessage("");
      setSubject("");
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not send.");
    } finally {
      setSending(false);
    }
  }

  const icon = tab === "Send SMS" ? <MessageSquareText size={18} /> : tab === "Send WhatsApp" ? <MessageCircle size={18} /> : tab === "Send Email" ? <Mail size={18} /> : <Bell size={18} />;

  return (
    <div>
      <PageHeader title="Broadcast" subtitle="Message your downline directly from the platform." />

      <div className="mb-5 flex gap-2 border-b border-ink-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setResult(""); setError(""); }}
            className={`border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
              tab === t ? "border-brand-600 text-brand-600" : "border-transparent text-ink-500 hover:text-ink-800"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <Card className="h-fit p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              {icon}
            </div>
            <div className="text-sm font-semibold text-ink-900">{tab}</div>
          </div>
          <form className="flex flex-col gap-4" onSubmit={handleSend}>
            <ScopeFields scope={scope} setScope={setScope} userId={userId} setUserId={setUserId} users={users} />
            {tab === "Send Email" && (
              <FormField label="Subject">
                <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClasses} required />
              </FormField>
            )}
            <FormField label="Message">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className={inputClasses}
                required
              />
            </FormField>
            {error && <div className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>}
            {result && <div className="rounded-lg bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">{result}</div>}
            <Button type="submit" loading={sending}>
              {sending ? "Sending..." : tab}
            </Button>
          </form>
        </Card>

        <div>
          {tab === "Send WhatsApp" && waLogs.length > 0 && (
            <Table>
              <THead><Th>To</Th><Th>Message</Th><Th>Status</Th><Th>Date</Th></THead>
              <tbody>
                {waLogs.map((l) => (
                  <Tr key={l.id}>
                    <Td>{l.toPhone}</Td>
                    <Td className="max-w-xs truncate normal-case text-ink-600">{l.message}</Td>
                    <Td>{l.status}</Td>
                    <Td className="text-ink-500">{new Date(l.createdAt).toLocaleString()}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
          {tab === "Send Email" && emailLogs.length > 0 && (
            <Table>
              <THead><Th>To</Th><Th>Subject</Th><Th>Status</Th><Th>Date</Th></THead>
              <tbody>
                {emailLogs.map((l) => (
                  <Tr key={l.id}>
                    <Td>{l.toEmail}</Td>
                    <Td className="max-w-xs truncate normal-case text-ink-600">{l.subject}</Td>
                    <Td>{l.status}</Td>
                    <Td className="text-ink-500">{new Date(l.createdAt).toLocaleString()}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
