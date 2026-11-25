import { type FormEvent, useEffect, useState } from "react";
import { UserPlus, Users as UsersIcon, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { FormField, inputClasses } from "../components/ui/FormField";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";

const ROLE_ORDER = ["ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR", "RETAILER"];

interface DownlineUser {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: string;
  status: string;
  walletBalance: string;
  commissionPackId: string | null;
  referralCode: string | null;
  createdAt: string;
}

interface Pack {
  id: string;
  name: string;
}

function rolesBelow(role: string) {
  const idx = ROLE_ORDER.indexOf(role);
  return ROLE_ORDER.slice(idx + 1);
}

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const allowedRoles = rolesBelow(currentUser?.role || "");

  const [users, setUsers] = useState<DownlineUser[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(allowedRoles[0] || "");
  const [referredByCode, setReferredByCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get("search") ?? "";
  const [searchInput, setSearchInput] = useState(urlSearch);
  const [search, setSearch] = useState(urlSearch);

  // The top bar's "Search User" navigates here with ?search=; follow it while mounted.
  useEffect(() => {
    setSearchInput(urlSearch);
    setSearch(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function loadUsers() {
    setLoading(true);
    Promise.all([
      api.get("/users", { params: { search } }),
      api.get("/commission-slabs"),
    ]).then(([usersRes, packsRes]) => {
      setUsers(usersRes.data.users);
      setPacks(packsRes.data.packs);
      setLoading(false);
    });
  }

  useEffect(loadUsers, [search]);

  async function assignCommission(userId: string, commissionPackId: string) {
    await api.patch(`/users/${userId}/commission`, {
      commissionPackId: commissionPackId || null,
    });
    loadUsers();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/users", { name, phone, password, role, referredByCode: referredByCode || undefined });
      setName("");
      setPhone("");
      setPassword("");
      setReferredByCode("");
      loadUsers();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not create user.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Users" subtitle="Manage the retailers and distributors in your downline." />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {allowedRoles.length > 0 && (
          <Card className="h-fit p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <UserPlus size={18} />
              </div>
              <div>
                <div className="text-sm font-semibold text-ink-900">Add User</div>
                <div className="text-xs text-ink-500">Onboard someone below your role</div>
              </div>
            </div>

            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <FormField label="Name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClasses}
                  required
                />
              </FormField>
              <FormField label="Phone">
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClasses}
                  required
                />
              </FormField>
              <FormField label="Password">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClasses}
                  required
                />
              </FormField>
              <FormField label="Role">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className={inputClasses}
                  required
                >
                  {allowedRoles.map((r) => (
                    <option key={r} value={r}>
                      {r.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Referred By Code" hint="Optional — the referrer's code">
                <input
                  value={referredByCode}
                  onChange={(e) => setReferredByCode(e.target.value.toUpperCase())}
                  className={inputClasses}
                />
              </FormField>

              {error && (
                <div className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                  {error}
                </div>
              )}

              <Button type="submit" loading={submitting} className="mt-1">
                {submitting ? "Creating..." : "Add User"}
              </Button>
            </form>
          </Card>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
              Your Downline
            </h2>
            <div className="relative w-56">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
              />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name or phone"
                className={`${inputClasses} py-1.5 pl-8 text-sm`}
              />
            </div>
          </div>

          {loading ? null : users.length === 0 ? (
            <Card>
              <EmptyState
                icon={<UsersIcon size={22} />}
                message={search ? "No users match your search." : "No users in your downline yet."}
              />
            </Card>
          ) : (
            <Table>
              <THead>
                <Th>Name</Th>
                <Th>Phone</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Wallet Balance</Th>
                <Th>Commission Pack</Th>
                <Th>Referral Code</Th>
                <Th>Created</Th>
              </THead>
              <tbody>
                {users.map((u) => (
                  <Tr key={u.id}>
                    <Td className="font-medium text-ink-900">{u.name}</Td>
                    <Td>{u.phone}</Td>
                    <Td className="text-ink-500">{u.role.replace("_", " ")}</Td>
                    <Td>
                      <Badge>{u.status}</Badge>
                    </Td>
                    <Td>₹{u.walletBalance}</Td>
                    <Td>
                      <select
                        className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs text-ink-700 outline-none focus:border-brand-500"
                        value={u.commissionPackId ?? ""}
                        onChange={(e) => assignCommission(u.id, e.target.value)}
                      >
                        <option value="">No commission</option>
                        {packs.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </Td>
                    <Td className="font-mono text-xs text-ink-500">{u.referralCode ?? "-"}</Td>
                    <Td className="text-ink-500">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </Td>
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
