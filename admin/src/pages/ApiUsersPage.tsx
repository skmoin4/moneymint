import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { PageLoader } from "../components/ui/PageLoader";
import { Button } from "../components/ui/Button";
import { compactInputClasses } from "../components/ui/FormField";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";
import { Badge } from "../components/ui/Badge";
import { errorText, formatStamp, inr } from "../components/txn/types";

interface ApiUser {
  userId: string;
  name: string;
  phone: string;
  role: string;
  userStatus: string;
  balance: number;
  isActive: boolean;
  hasToken: boolean;
  tokenPrefix: string | null;
  allowedIps: string;
  callbackUrl: string | null;
  lastUsedAt: string | null;
  today: { count: number; success: number };
}

interface Candidate {
  id: string;
  name: string;
  phone: string;
  role: string;
  apiCredential: { isActive: boolean } | null;
}

// Admin: which users may call the partner API, and switch it on/off.
export function ApiUsersPage() {
  const [users, setUsers] = useState<ApiUser[] | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  function load() {
    api.get("/api-access/users").then((res) => setUsers(res.data.users));
  }
  useEffect(load, []);

  async function find(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const res = await api.get("/api-access/candidates", { params: { search: search.trim() } });
    setCandidates(res.data.users);
    if (res.data.users.length === 0) setMessage({ ok: false, text: "No user found with that name or mobile." });
  }

  async function enable(c: Candidate) {
    if (!window.confirm(`Enable API access for ${c.name} (${c.phone})?`)) return;
    try {
      await api.post("/api-access/users", { userId: c.id });
      setMessage({ ok: true, text: `API access enabled for ${c.name}. They create their token under API → API Token & Callback (after logging in again).` });
      setCandidates([]);
      setSearch("");
      load();
    } catch (err) {
      setMessage({ ok: false, text: errorText(err) });
    }
  }

  async function toggle(u: ApiUser) {
    if (u.isActive && !window.confirm(`Disable API access for ${u.name}? Their server's requests will be refused immediately.`)) return;
    await api.patch(`/api-access/users/${u.userId}`, { isActive: !u.isActive });
    load();
  }

  return (
    <div>
      <PageHeader title="API Users" />
      <form onSubmit={find} className="mb-4 rounded-sm border border-ink-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold">Enable API for user:</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or mobile" className={`${compactInputClasses} w-56`} required minLength={2} />
          <Button type="submit" variant="secondary">
            Find
          </Button>
          <span className="text-[12px] text-ink-500">The user then generates their own token, whitelists their server IP and sets a callback URL.</span>
        </div>
        {candidates.length > 0 && (
          <ul className="mt-3 divide-y divide-ink-100 rounded-sm border border-ink-200">
            {candidates.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-3 py-2">
                <span>
                  {c.name} ({c.phone}) <span className="text-ink-400">{c.role.replace("_", " ").toLowerCase()}</span>
                </span>
                {c.apiCredential?.isActive ? (
                  <span className="text-[12px] text-brand-600">API enabled</span>
                ) : (
                  <Button size="sm" type="button" onClick={() => enable(c)}>
                    Enable API
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </form>
      {message && (
        <div className={`mb-4 rounded-sm px-3 py-2 text-[12.5px] ${message.ok ? "bg-row-success text-[#3c763d]" : "bg-row-failed text-[#a94442]"}`}>{message.text}</div>
      )}
      {users === null ? (
        <PageLoader />
      ) : (
        <Table>
          <THead>
            <Th>User</Th>
            <Th>Role</Th>
            <Th className="text-right">Balance</Th>
            <Th>Token</Th>
            <Th>Whitelisted IPs</Th>
            <Th>Callback</Th>
            <Th>Today</Th>
            <Th>Last used</Th>
            <Th>API</Th>
          </THead>
          <tbody>
            {users.length === 0 ? (
              <Tr>
                <Td colSpan={9} className="py-8 text-center text-ink-400">
                  No API users yet.
                </Td>
              </Tr>
            ) : (
              users.map((u) => (
                <Tr key={u.userId}>
                  <Td>
                    {u.name} ({u.phone}) {u.userStatus !== "ACTIVE" && <Badge>{u.userStatus}</Badge>}
                  </Td>
                  <Td>{u.role.replace("_", " ").toLowerCase()}</Td>
                  <Td className="text-right">{inr(u.balance)}</Td>
                  <Td className="font-mono text-[11.5px]">{u.hasToken ? `${u.tokenPrefix}…` : <span className="text-ink-400">not generated</span>}</Td>
                  <Td className="font-mono text-[11.5px]">{u.allowedIps || <span className="text-[#ed5565]">none</span>}</Td>
                  <Td className="max-w-56 truncate text-[11.5px]" title={u.callbackUrl ?? ""}>
                    {u.callbackUrl ?? "—"}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {u.today.count} txns · {inr(u.today.success)}
                  </Td>
                  <Td className="whitespace-nowrap">{u.lastUsedAt ? formatStamp(u.lastUsedAt) : "never"}</Td>
                  <Td>
                    <button onClick={() => toggle(u)} className={`rounded-[3px] px-2 py-[2px] text-[11px] font-semibold text-white ${u.isActive ? "bg-brand-500" : "bg-ink-400"}`}>
                      {u.isActive ? "Enabled" : "Disabled"}
                    </button>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      )}
    </div>
  );
}
