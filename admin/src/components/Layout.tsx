import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Wallet,
  LayoutDashboard,
  Smartphone,
  Receipt,
  BookOpen,
  Users,
  ArrowLeftRight,
  Server,
  Radio,
  Percent,
  FileText,
  Send,
  Fingerprint,
  ShieldCheck,
  MessageSquareWarning,
  BarChart3,
  Clock,
  Landmark,
  ChevronDown,
  ShieldAlert,
  MapPin,
  Settings2,
  Clock3,
  PlusCircle,
  Megaphone,
  Cog,
  CreditCard,
  Hash,
  Layers,
  Gift,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { NoticeBar } from "./NoticeBar";
import { TopBar } from "./TopBar";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/recharge", label: "New Recharge", icon: Smartphone },
  { to: "/bill-payment", label: "Bill Payments", icon: FileText },
  { to: "/dmt", label: "Money Transfer", icon: Send },
  { to: "/aeps", label: "AEPS", icon: Fingerprint },
];

const REPORTS_ITEMS: NavItem[] = [
  { to: "/transactions", label: "Transactions", icon: Receipt },
  { to: "/ledger", label: "Ledger", icon: BookOpen },
];

const MANAGER_REPORTS_ITEMS: NavItem[] = [
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/pending", label: "Pending", icon: Clock },
  { to: "/q-recharge", label: "Q Recharge", icon: Clock3 },
];

const SUPPORT_ITEMS: NavItem[] = [
  { to: "/kyc", label: "KYC", icon: ShieldCheck },
  { to: "/complaints", label: "Complaints", icon: MessageSquareWarning },
  { to: "/balance-requests", label: "Balance Requests", icon: Landmark },
];

const MANAGER_NAV_ITEMS: NavItem[] = [
  { to: "/users", label: "Users", icon: Users },
  { to: "/transfer", label: "Transfer Funds", icon: ArrowLeftRight },
  { to: "/broadcast", label: "Broadcast", icon: Megaphone },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  { to: "/providers", label: "Providers", icon: Server },
  { to: "/operators", label: "Operators", icon: Radio },
  { to: "/provider-api-setting", label: "Provider API Setting", icon: Settings2 },
  { to: "/commission", label: "Commission Slabs", icon: Percent },
  { to: "/bank-details", label: "Bank Details", icon: Landmark },
  { to: "/circles", label: "Circle Master", icon: MapPin },
  { to: "/security", label: "Security", icon: ShieldAlert },
  { to: "/manual-txn", label: "Add Transaction", icon: PlusCircle },
  { to: "/payment-modes", label: "Payment Modes", icon: CreditCard },
  { to: "/operator-prefixes", label: "Operator Prefixes", icon: Hash },
  { to: "/recharge-plans", label: "Recharge Plans", icon: Layers },
  { to: "/cashback-offers", label: "Cashback Offers", icon: Gift },
  { to: "/settings", label: "Settings", icon: Cog },
];

function initials(name?: string) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function isItemActive(item: NavItem, pathname: string) {
  return item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function FlatNavSection({ items }: { items: NavItem[] }) {
  const { pathname } = useLocation();
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={
            isItemActive(item, pathname)
              ? "flex items-center gap-3 rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-medium text-white shadow-sm shadow-brand-900/40"
              : "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-400 transition-colors hover:bg-white/5 hover:text-white"
          }
        >
          <item.icon size={17} />
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

function CollapsibleNavSection({ label, items }: { label: string; items: NavItem[] }) {
  const { pathname } = useLocation();
  const isSectionActive = items.some((item) => isItemActive(item, pathname));
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (isSectionActive) setOpen(true);
  }, [isSectionActive]);

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-500 transition-colors hover:text-ink-300"
      >
        {label}
        <ChevronDown size={12} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open &&
        items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={
              isItemActive(item, pathname)
                ? "flex items-center gap-3 rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-medium text-white shadow-sm shadow-brand-900/40"
                : "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-400 transition-colors hover:bg-white/5 hover:text-white"
            }
          >
            <item.icon size={17} />
            {item.label}
          </NavLink>
        ))}
    </div>
  );
}

export function Layout() {
  const { user } = useAuth();
  const isRetailer = user?.role === "RETAILER";
  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="flex min-h-screen bg-ink-50">
      <aside className="flex w-64 shrink-0 flex-col bg-ink-950 px-4 py-6">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Wallet size={18} />
          </div>
          <span className="text-lg font-bold text-white">MoneyMint</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          <FlatNavSection items={NAV_ITEMS} />
          <CollapsibleNavSection label="Reports" items={REPORTS_ITEMS} />
          {!isRetailer && <CollapsibleNavSection label="Ops" items={MANAGER_REPORTS_ITEMS} />}
          <CollapsibleNavSection label="Support" items={SUPPORT_ITEMS} />
          {!isRetailer && <CollapsibleNavSection label="Team" items={MANAGER_NAV_ITEMS} />}
          {isAdmin && <CollapsibleNavSection label="Platform" items={ADMIN_NAV_ITEMS} />}
        </nav>

        <div className="mt-4 flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-300">
            {initials(user?.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{user?.name}</div>
            <div className="truncate text-xs text-ink-400">{user?.role.replace("_", " ")}</div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <NoticeBar />
        <main className="flex-1 overflow-x-hidden p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
