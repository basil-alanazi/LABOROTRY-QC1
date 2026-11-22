import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Activity,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Dna,
  Droplets,
  FolderClock,
  GraduationCap,
  HeartPulse,
  Languages,
  Menu,
  MessageSquare,
  NotebookPen,
  Package,
  Settings as SettingsIcon,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  LogOut,
  UserCircle,
  X,
} from "lucide-react";
import { useAuth } from "../../lib/auth.jsx";
import { useLanguage } from "../../lib/i18n.jsx";
import { supabase } from "../../lib/supabaseClient";
import rabiaLogo from "../../assets/rabia-logo.jpg";

const linkClass = ({ isActive }) =>
  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? "bg-teal-600 text-white shadow-sm" : "text-slate-600 hover:bg-white/70 hover:text-teal-700"
  }`;

export default function Layout({ children }) {
  const { session, logout, isAdmin, canViewEmployeeHealth, canViewHaiSurveillance, canEnterNursingRounds, canEnterQualityRounds, canEnterIcRounds } = useAuth();
  const { t, lang, toggleLang } = useLanguage();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  // Powers the "Messages" badge — polled as a fallback, plus a realtime
  // subscription so it updates instantly on a real Supabase backend.
  useEffect(() => {
    if (!session?.username) return;
    let cancelled = false;
    async function loadUnread() {
      const { data } = await supabase.from("messages").select("id").eq("recipient_username", session.username).is("read_at", null);
      if (!cancelled) setUnreadCount((data ?? []).length);
    }
    loadUnread();
    // Realtime (below) handles the instant case; this is only a fallback
    // in case that channel silently drops — infrequent on purpose so every
    // logged-in account isn't hitting the database every few seconds.
    // On Cloudflare the channel below is itself a once-a-minute poll, so
    // this extra timer would only double the requests.
    const interval = supabase.isCloudflare ? null : setInterval(loadUnread, 90000);
    let channel;
    if (!supabase.isMock) {
      channel = supabase.channel("layout-messages").on("postgres_changes", { event: "*", schema: "public", table: "messages" }, loadUnread).subscribe();
    }
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
    };
  }, [session?.username]);

  // Sidebar, grouped by area so the ~16 pages are quick to scan. A group
  // only shows when the account can see at least one page in it.
  const stockVisible =
    isAdmin ||
    !(
      session?.canViewEmployeeHealth ||
      session?.canViewHaiSurveillance ||
      session?.canEnterNursingRounds ||
      session?.canEnterQualityRounds ||
      session?.canEnterIcRounds
    );
  const navGroups = [
    {
      title: "Surveillance",
      items: [
        canViewHaiSurveillance && { to: "/hai-surveillance", icon: Activity, label: "HAI Surveillance" },
        canViewHaiSurveillance && !(session?.haiScope && !isAdmin) && { to: "/hai-monthly-indicators", icon: Dna, label: "Monthly IPC Indicator" },
        canViewHaiSurveillance && { to: "/hai-care-bundles", icon: ClipboardList, label: "IPC Care Bundles" },
        isAdmin && { to: "/cases", icon: ShieldAlert, label: "Suspected/Confirmed Cases" },
      ],
    },
    {
      title: "Rounds",
      items: [
        canEnterIcRounds && { to: "/ic-rounds", icon: ClipboardCheck, label: "Daily IC Rounds" },
        isAdmin && { to: "/hand-hygiene", icon: Droplets, label: "Hand Hygiene" },
        canEnterNursingRounds && { to: "/nursing-rounds", icon: ShieldCheck, label: "Nursing Daily Rounds" },
        canEnterQualityRounds && { to: "/quality-rounds", icon: Sparkles, label: "Quality Daily Rounds" },
      ],
    },
    {
      title: "Staff",
      items: [
        canViewEmployeeHealth && { to: "/employee-health", icon: HeartPulse, label: "Employee Health" },
        isAdmin && { to: "/ic-knowledge-test", icon: GraduationCap, label: "IC Knowledge Test" },
      ],
    },
    {
      title: "Trackers & Supplies",
      items: [
        isAdmin && { to: "/trackers", icon: FolderClock, label: "Trackers" },
        stockVisible && { to: "/stock", icon: Package, label: "Stock Requests" },
      ],
    },
    {
      title: "General",
      items: [
        { to: "/ipc-calendar", icon: CalendarDays, label: "IPC Calendar" },
        isAdmin && { to: "/notes", icon: NotebookPen, label: "Notes" },
        { to: "/messages", icon: MessageSquare, label: "Messages", badge: unreadCount },
        { to: "/profile", icon: UserCircle, label: "Profile" },
        isAdmin && { to: "/settings", icon: SettingsIcon, label: "Settings" },
      ],
    },
  ]
    .map((g) => ({ ...g, items: g.items.filter(Boolean) }))
    .filter((g) => g.items.length > 0);

  const navLinks = navGroups.map((g) => (
    <div key={g.title} className="mb-2">
      <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t(g.title)}</p>
      <div className="flex flex-col gap-0.5">
        {g.items.map(({ to, icon: Icon, label, badge }) => (
          <NavLink key={to} to={to} className={linkClass} onClick={() => setSidebarOpen(false)}>
            <Icon className="h-4 w-4 shrink-0" />
            {t(label)}
            {badge > 0 && (
              <span className="ms-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  ));

  return (
    <div className="flex min-h-screen bg-slate-50">
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 start-0 z-30 flex w-64 flex-col border-e border-slate-200 bg-slate-100 transition-transform md:static md:translate-x-0 print:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-4">
          <div className="flex min-w-0 flex-col gap-1">
            <img src={rabiaLogo} alt="Rabia Hospital" className="h-12 w-auto max-w-[9.5rem] object-contain object-left rtl:object-right" />
            <span className="font-serif text-sm font-semibold text-teal-700">{t("Infection Control")}</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-slate-600 md:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col overflow-y-auto px-3 pb-3">{navLinks}</nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur print:hidden">
          <div className="flex items-center gap-3 md:hidden">
            <button onClick={() => setSidebarOpen(true)} className="text-slate-500 hover:text-slate-800" aria-label={t("Menu")}>
              <Menu className="h-5 w-5" />
            </button>
            <img src={rabiaLogo} alt="Rabia Hospital" className="h-7 w-auto object-contain" />
          </div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span>{session?.displayName}</span>
            <button
              onClick={toggleLang}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              title={lang === "ar" ? "English" : "العربية"}
            >
              <Languages className="h-4 w-4" />
              {lang === "ar" ? "EN" : "AR"}
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <LogOut className="h-4 w-4" />
              {t("Log out")}
            </button>
          </div>
        </header>
        {supabase.isMock && (
          <div className="bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800 print:hidden">
            {t("Preview mode — sample data, not connected to a real database. Nothing is saved after a page refresh.")}
          </div>
        )}
        <main className="flex-1 px-4 py-6 print:p-0">{children}</main>
      </div>
    </div>
  );
}
