import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, Wallet, Bell, BellRing, Landmark, LogOut } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

interface NotificationItem {
  id: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [balance, setBalance] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [alerts, setAlerts] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    api.get("/wallet/balance").then((res) => setBalance(res.data.balance));
  }, [location.pathname]);

  useEffect(() => {
    if (user?.role === "RETAILER") return;
    Promise.all([
      api.get("/kyc/requests", { params: { status: "PENDING" } }).catch(() => ({ data: { requests: [] } })),
      api.get("/balance-requests/team", { params: { status: "PENDING" } }).catch(() => ({ data: { requests: [] } })),
    ]).then(([kycRes, balRes]) => {
      setAlerts(kycRes.data.requests.length + balRes.data.requests.length);
    });
  }, [location.pathname, user?.role]);

  useEffect(() => {
    api.get("/broadcast/my-notifications").then((res) => {
      setNotifications(res.data.notifications);
      setUnreadCount(res.data.unreadCount);
    });
  }, [location.pathname]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    navigate(`/transactions?search=${encodeURIComponent(query.trim())}`);
  }

  async function openNotifications() {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next && unreadCount > 0) {
      await api.post("/broadcast/my-notifications/mark-read", {});
      setUnreadCount(0);
    }
  }

  return (
    <header className="relative flex h-14 shrink-0 items-center gap-4 border-b border-ink-200 bg-white px-6">
      <form onSubmit={handleSearch} className="relative w-72 max-w-full">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a mobile / consumer number..."
          className="w-full rounded-lg border border-ink-200 bg-ink-50 py-1.5 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/10"
        />
      </form>

      <div className="ml-auto flex items-center gap-2 text-sm">
        <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700">
          <Wallet size={14} />₹{balance ?? "..."}
        </div>

        {user?.role !== "RETAILER" && (
          <button
            onClick={() => navigate("/kyc")}
            className="relative flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100"
            title="Pending approvals"
          >
            <Bell size={16} />
            {alerts > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {alerts}
              </span>
            )}
          </button>
        )}

        <div className="relative">
          <button
            onClick={openNotifications}
            className="relative flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100"
            title="Notifications"
          >
            <BellRing size={16} />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-10 z-20 w-80 rounded-xl border border-ink-200 bg-white p-2 shadow-lg">
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-xs text-ink-400">No notifications yet.</div>
              ) : (
                <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
                  {notifications.map((n) => (
                    <div key={n.id} className="rounded-lg px-3 py-2 text-xs text-ink-700 hover:bg-ink-50">
                      <div>{n.message}</div>
                      <div className="mt-1 text-[10px] text-ink-400">{new Date(n.createdAt).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => navigate("/balance-requests")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100"
          title="Bank Details"
        >
          <Landmark size={16} />
        </button>

        <div className="mx-1 h-6 w-px bg-ink-200" />

        <span className="text-ink-500">Hello, {user?.name}</span>

        <button
          onClick={logout}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-ink-500 hover:bg-ink-100"
        >
          <LogOut size={14} /> Log out
        </button>
      </div>
    </header>
  );
}
