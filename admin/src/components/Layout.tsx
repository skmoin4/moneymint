import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Globe,
  SlidersHorizontal,
  Plug,
  Users,
  IndianRupee,
  BarChart3,
  Smartphone,
  UserCog,
  ChevronLeft,
  ChevronDown,
  LifeBuoy,
  Phone,
  Mail,
  Clock,
  LogOut,
  History,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { NoticeBar } from "./NoticeBar";
import { TopBar } from "./TopBar";
import { api } from "../api/client";
import { LoginHistoryModal } from "./LoginHistoryModal";

type Role = "ADMIN" | "MASTER_DISTRIBUTOR" | "DISTRIBUTOR" | "RETAILER";
const ALL: Role[] = ["ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR", "RETAILER"];
const MANAGERS: Role[] = ["ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"];
const ADMIN: Role[] = ["ADMIN"];

interface SubItem {
  to: string;
  label: string;
  roles: Role[];
}

interface MenuItem {
  label: string;
  icon: LucideIcon;
  roles: Role[];
  to?: string; // a direct link…
  children?: SubItem[]; // …or a collapsible group
}

// Sidebar menu, grouped the way operators of recharge portals expect to find things.
const MENU: MenuItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/", roles: ALL },
  { label: "Insights", icon: Globe, to: "/reports", roles: MANAGERS },
  {
    label: "Commission",
    icon: SlidersHorizontal,
    roles: ADMIN,
    children: [
      { to: "/commission", label: "Commission Packs", roles: ADMIN },
      { to: "/cashback-offers", label: "Cashback Offers", roles: ADMIN },
    ],
  },
  {
    label: "API",
    icon: Plug,
    roles: ADMIN,
    children: [
      { to: "/providers", label: "Add API / APIs", roles: ADMIN },
      { to: "/provider-api-setting", label: "Provider API Setting", roles: ADMIN },
      { to: "/api-parsing-setting", label: "API Parsing Setting", roles: ADMIN },
      { to: "/operators", label: "Operators", roles: ADMIN },
      { to: "/operator-prefixes", label: "Operator Series", roles: ADMIN },
      { to: "/recharge-plans", label: "Recharge Plans", roles: ADMIN },
      { to: "/circles", label: "Circles", roles: ADMIN },
    ],
  },
  {
    label: "Users",
    icon: Users,
    roles: MANAGERS,
    children: [
      { to: "/users", label: "Users List", roles: MANAGERS },
      { to: "/kyc", label: "KYC Update Requests", roles: MANAGERS },
    ],
  },
  {
    label: "Balance",
    icon: IndianRupee,
    roles: ALL,
    children: [
      { to: "/transfer", label: "Transfer Balance", roles: MANAGERS },
      { to: "/balance-requests", label: "Balance Requests", roles: ALL },
      { to: "/ledger", label: "Account Ledger", roles: ALL },
      { to: "/bank-details", label: "Bank Details", roles: ADMIN },
      { to: "/payment-modes", label: "Payment Modes", roles: ADMIN },
    ],
  },
  {
    label: "Reports",
    icon: BarChart3,
    roles: ALL,
    children: [
      { to: "/pending", label: "Pendings", roles: MANAGERS },
      { to: "/transactions", label: "Transaction History", roles: ALL },
      { to: "/transactions?status=REFUNDED", label: "Refunds", roles: MANAGERS },
      { to: "/manual-txn", label: "Manual Transaction", roles: ADMIN },
      { to: "/q-recharge", label: "Q Recharge", roles: MANAGERS },
      { to: "/complaints", label: "Complaints", roles: ALL },
    ],
  },
  {
    label: "Services",
    icon: Smartphone,
    roles: ALL,
    children: [
      { to: "/recharge", label: "Recharge", roles: ALL },
      { to: "/bill-payment", label: "Bill Payment", roles: ALL },
      { to: "/dmt", label: "Money Transfer", roles: ALL },
      { to: "/aeps", label: "AEPS", roles: ALL },
    ],
  },
  {
    label: "Admin",
    icon: UserCog,
    roles: MANAGERS,
    children: [
      { to: "/broadcast", label: "Broadcast / News", roles: MANAGERS },
      { to: "/security", label: "Security & IP Whitelist", roles: ADMIN },
      { to: "/settings", label: "Settings", roles: ADMIN },
    ],
  },
];

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrator",
  MASTER_DISTRIBUTOR: "Master Distributor",
  DISTRIBUTOR: "Distributor",
  RETAILER: "Retailer",
};

const SUPPORT = {
  phone: import.meta.env.VITE_SUPPORT_PHONE as string | undefined,
  email: import.meta.env.VITE_SUPPORT_EMAIL as string | undefined,
  hours: (import.meta.env.VITE_SUPPORT_HOURS as string | undefined) ?? "9 am TO 9 pm",
};

function subItemActive(to: string, pathname: string, search: string) {
  const [path, query] = to.split("?");
  if (query) return pathname === path && search.includes(query);
  return (pathname === path || pathname.startsWith(`${path}/`)) && !(path === "/transactions" && search.includes("status=REFUNDED"));
}

function Logo() {
  return (
    <Link to="/" className="flex flex-col items-center gap-2 bg-side-900 px-4 pb-4 pt-5">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-brand-400 bg-side-800 text-[26px] font-bold text-brand-400">
        ₹M
      </div>
      <span className="text-[18px] font-semibold tracking-wide text-white">
        Money<span className="text-brand-400">Mint</span>
      </span>
    </Link>
  );
}

function ProfileBlock({ balance, onLoginHistory }: { balance: string | null; onLoginHistory: () => void }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative border-b border-black/20 bg-side-900/60 px-5 py-4">
      <div className="text-[13px] font-bold text-white">{user?.name}</div>
      <button onClick={() => setOpen((o) => !o)} className="mt-0.5 flex items-center gap-1 text-[12px] text-side-300 hover:text-white">
        {ROLE_LABEL[user?.role ?? ""] ?? user?.role}
        <ChevronDown size={12} />
      </button>
      {balance !== null && <div className="mt-1 text-[12px] text-brand-400">Bal: ₹{balance}</div>}
      {open && (
        <div className="absolute left-4 top-[70px] z-30 w-44 rounded-sm bg-white py-1 text-[13px] shadow-lg">
          <button
            onClick={() => {
              setOpen(false);
              onLoginHistory();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink-700 hover:bg-ink-50"
          >
            <History size={14} /> Login history
          </button>
          <button onClick={logout} className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink-700 hover:bg-ink-50">
            <LogOut size={14} /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

function MenuGroup({ item, role, onNavigate }: { item: MenuItem; role: Role; onNavigate: () => void }) {
  const { pathname, search } = useLocation();
  const children = (item.children ?? []).filter((c) => c.roles.includes(role));
  const active = children.some((c) => subItemActive(c.to, pathname, search));
  const [open, setOpen] = useState(active);

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  if (children.length === 0) return null;
  return (
    <li className={open ? "border-l-4 border-brand-500 bg-side-700" : "border-l-4 border-transparent"}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-2.5 py-[13px] pl-4 pr-3 text-[13px] font-semibold transition-colors ${
          open || active ? "text-white" : "text-side-300 hover:text-white"
        }`}
        aria-expanded={open}
      >
        <item.icon size={14} />
        <span className="flex-1 text-left">{item.label}</span>
        {open ? <ChevronDown size={13} /> : <ChevronLeft size={13} />}
      </button>
      {open && (
        <ul className="pb-2">
          {children.map((c) => {
            const isActive = subItemActive(c.to, pathname, search);
            return (
              <li key={c.to}>
                <Link
                  to={c.to}
                  onClick={onNavigate}
                  className={`block py-[7px] pl-11 pr-3 text-[12.5px] ${
                    isActive ? "font-bold text-white" : "text-side-300 hover:text-white"
                  }`}
                >
                  {c.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export function Layout() {
  const { user } = useAuth();
  const role = (user?.role ?? "RETAILER") as Role;
  const location = useLocation();
  const [balance, setBalance] = useState<string | null>(null);
  // Desktop: sidebar shown by default and collapsible. Phone: hidden until toggled.
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    api.get("/wallet/balance").then((res) => setBalance(res.data.balance)).catch(() => {});
  }, [location.pathname]);

  const closeOnPhone = () => {
    if (window.innerWidth < 1024) setSidebarOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-ink-50">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[220px] shrink-0 flex-col bg-side-800 transition-transform lg:static lg:z-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:hidden"
        }`}
      >
        <Logo />
        <ProfileBlock balance={balance} onLoginHistory={() => setHistoryOpen(true)} />
        <nav className="flex-1 overflow-y-auto">
          <ul>
            {MENU.filter((m) => m.roles.includes(role)).map((m) =>
              m.to ? (
                <li key={m.label} className="border-l-4 border-transparent">
                  <NavLink
                    to={m.to}
                    end
                    onClick={closeOnPhone}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 py-[13px] pl-4 pr-3 text-[13px] font-semibold transition-colors ${
                        isActive ? "bg-side-700 text-white" : "text-side-300 hover:text-white"
                      }`
                    }
                  >
                    <m.icon size={14} />
                    {m.label}
                  </NavLink>
                </li>
              ) : (
                <MenuGroup key={m.label} item={m} role={role} onNavigate={closeOnPhone} />
              )
            )}
          </ul>
          <div className="mt-2 bg-brand-500 px-5 py-4 text-[12.5px] font-bold text-white">
            <div className="mb-1.5 flex items-center gap-1.5">
              <LifeBuoy size={13} /> Support:
            </div>
            {SUPPORT.phone && (
              <div className="flex items-center gap-1.5">
                <Phone size={12} /> {SUPPORT.phone}
              </div>
            )}
            {SUPPORT.email && (
              <div className="flex items-center gap-1.5">
                <Mail size={12} /> {SUPPORT.email}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Clock size={12} /> {SUPPORT.hours}
            </div>
          </div>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onToggleSidebar={() => setSidebarOpen((o) => !o)} />
        <NoticeBar />
        <main className="flex-1 overflow-x-hidden p-4 md:px-6 md:py-5">
          <Outlet />
        </main>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-200 bg-white px-5 py-3 text-[12.5px] text-ink-700">
          <span>
            Copyright MoneyMint © {new Date().getFullYear()} - Logged in as {ROLE_LABEL[role] ?? role} |{" "}
            <button onClick={() => setHistoryOpen(true)} className="text-[#337ab7] hover:underline">
              Login history
            </button>
          </span>
          <span>v{import.meta.env.VITE_APP_VERSION ?? "1.0.0"}</span>
        </footer>
      </div>
      {historyOpen && <LoginHistoryModal onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}
