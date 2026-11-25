import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, Search, IndianRupee, Mail, Bell, Landmark, LogOut } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

interface NotificationItem {
  id: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[3px] bg-[#ed5565] px-1 text-[10px] font-bold text-white">
      {n}
    </span>
  );
}

export function TopBar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isManager = user?.role !== "RETAILER";
  const [query, setQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [counts, setCounts] = useState({ balanceRequests: 0, complaints: 0 });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    if (!isManager) return;
    api
      .get("/dashboard/pending-summary")
      .then((res) =>
        setCounts({ balanceRequests: res.data.pendingBalanceRequests, complaints: res.data.openComplaints })
      )
      .catch(() => {});
  }, [location.pathname, isManager]);

  useEffect(() => {
    api
      .get("/broadcast/my-notifications")
      .then((res) => {
        setNotifications(res.data.notifications);
        setUnreadCount(res.data.unreadCount);
      })
      .catch(() => {});
  }, [location.pathname]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    navigate(`/transactions?mobile=${encodeURIComponent(query.trim())}`);
    setQuery("");
  }

  function handleUserSearch(e: FormEvent) {
    e.preventDefault();
    if (!userQuery.trim()) return;
    navigate(`/users?search=${encodeURIComponent(userQuery.trim())}`);
    setUserSearchOpen(false);
    setUserQuery("");
  }

  async function openNotifications() {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next && unreadCount > 0) {
      await api.post("/broadcast/my-notifications/mark-read", {});
      setUnreadCount(0);
    }
  }

  const link = "flex items-center gap-1 px-2 py-1 text-[12.5px] font-semibold text-ink-500 hover:text-ink-800";

  return (
    <header className="relative flex min-h-[60px] shrink-0 flex-wrap items-center gap-3 border-b border-ink-200 bg-white px-4">
      <button
        onClick={onToggleSidebar}
        className="flex h-[30px] w-[38px] items-center justify-center rounded-[3px] bg-brand-500 text-white hover:bg-brand-600"
        aria-label="Toggle menu"
      >
        <Menu size={16} />
      </button>

      <form onSubmit={handleSearch} className="min-w-0 flex-1 sm:max-w-80">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for number..."
          className="w-full border-0 bg-transparent px-1 py-1.5 text-[13px] text-ink-700 outline-none placeholder:text-ink-400"
        />
      </form>

      <nav className="ml-auto flex flex-wrap items-center gap-1">
        <Link to="/" className={`${link} hidden md:flex`}>
          Dashboard
        </Link>

        {isManager && (
          <div className="relative">
            <button onClick={() => setUserSearchOpen((o) => !o)} className={link}>
              <Search size={13} /> <span className="hidden sm:inline">Search User</span>
            </button>
            {userSearchOpen && (
              <form
                onSubmit={handleUserSearch}
                className="absolute right-0 top-9 z-30 flex w-64 gap-1 rounded-sm border border-ink-200 bg-white p-2 shadow-lg"
              >
                <input
                  autoFocus
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  placeholder="Name or mobile"
                  className="min-w-0 flex-1 rounded-[2px] border border-[#e5e6e7] px-2 py-1 text-[13px] outline-none focus:border-brand-500"
                />
                <button className="rounded-[3px] bg-brand-500 px-2.5 text-[12px] text-white">Go</button>
              </form>
            )}
          </div>
        )}

        {isManager && (
          <>
            <Link to="/balance-requests" className={link} title="Pending balance requests">
              <IndianRupee size={13} />
              <CountBadge n={counts.balanceRequests} />
            </Link>
            <Link to="/complaints" className={link} title="Open complaints">
              <Mail size={13} />
              <CountBadge n={counts.complaints} />
            </Link>
          </>
        )}

        <div className="relative">
          <button onClick={openNotifications} className={link} title="Notifications">
            <Bell size={13} />
            {unreadCount > 0 && <CountBadge n={unreadCount} />}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-9 z-30 w-80 rounded-sm border border-ink-200 bg-white p-1 shadow-lg">
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-[12px] text-ink-400">No notifications yet.</div>
              ) : (
                <div className="flex max-h-80 flex-col overflow-y-auto">
                  {notifications.map((n) => (
                    <div key={n.id} className="border-b border-ink-100 px-3 py-2 text-[12px] text-ink-700 last:border-0">
                      <div>{n.message}</div>
                      <div className="mt-0.5 text-[10.5px] text-ink-400">{new Date(n.createdAt).toLocaleString("en-IN")}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <Link to={user?.role === "ADMIN" ? "/bank-details" : "/balance-requests"} className={link}>
          <Landmark size={13} /> <span className="hidden sm:inline">Bank Details</span>
        </Link>

        <button onClick={logout} className={link}>
          <LogOut size={13} /> <span className="hidden sm:inline">Log out</span>
        </button>
      </nav>
    </header>
  );
}
